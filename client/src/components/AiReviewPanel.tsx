import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { api } from '../api/client';
import { Icon } from './Icon';
import { AiFixModal, type FixableFinding } from './AiFixModal';
import { EntityJumpButton } from './EntityJumpButton';
import type { AiPreview, AiReviewFinding, AiReviewSeverity, Policy } from '../types/proxy';

const SEVERITY_STYLE: Record<AiReviewSeverity, { color: string; tint: string; label: string }> = {
  high: { color: 'var(--error)', tint: 'var(--error-soft)', label: 'high' },
  medium: { color: 'var(--warning)', tint: 'var(--warning-soft)', label: 'medium' },
  low: { color: 'var(--text-3)', tint: 'var(--bg-2)', label: 'low' },
};

/**
 * Turns a review finding into the shape the fix endpoint takes.
 *
 * The filePath is what ties it to a policy — the server re-resolves it and is
 * the authority. There is no ruleId, which is exactly right: this did not come
 * from a rule, so the fixer will correctly report that it could not re-check
 * whether the finding went away, rather than claiming it did.
 */
function asFixableFinding(finding: AiReviewFinding, policy: { name: string }): FixableFinding {
  return {
    filePath: `apiproxy/policies/${policy.name}.xml`,
    ruleId: null,
    line: null,
    column: null,
    severity: 'warning',
    message: `${finding.title}. ${finding.detail} ${finding.recommendation}`.slice(0, 4000),
  };
}

function FindingCard({ finding }: { finding: AiReviewFinding }) {
  const proxy = useStore((s) => s.currentProxy)!;
  const [fixing, setFixing] = useState<{ finding: FixableFinding; policy: Policy } | null>(null);
  const style = SEVERITY_STYLE[finding.severity];

  // Only offered when the model said the remedy is inside the named policy's
  // own XML. A step that has to move is a flow edit, and no rewrite of the
  // policy can accomplish it — the same line the Lint tab draws.
  const fixTarget =
    finding.fixKind === 'policy'
      ? proxy.policies.find((p) => p.id === finding.policies[0]?.id) ?? null
      : null;

  return (
    <div className="ai-review-finding" style={{ borderLeft: `3px solid ${style.color}` }}>
      <div className="ai-review-finding-head">
        <span
          className="template-badge"
          style={{ color: style.color, background: style.tint, borderColor: style.color }}
        >
          {style.label}
        </span>
        <strong style={{ flex: 1, fontSize: 13 }}>{finding.title}</strong>
        <span className="field-hint mono" style={{ flexShrink: 0 }}>
          {finding.category}
        </span>
        {fixTarget && (
          <button
            className="btn btn-sm btn-ghost"
            style={{ flexShrink: 0 }}
            onClick={() => setFixing({ finding: asFixableFinding(finding, fixTarget), policy: fixTarget })}
            title={`Propose a fix for ${fixTarget.name}`}
          >
            <Icon name="sparkles" size={12} /> Fix with AI
          </button>
        )}
      </div>

      <p className="ai-review-text">{finding.detail}</p>
      <p className="ai-review-text">
        <strong>Suggested:</strong> {finding.recommendation}
      </p>

      <div className="ai-review-refs">
        {finding.where && <span className="field-hint mono">{finding.where}</span>}
        {finding.policies.map((p) => (
          <span className="chip mono" key={p.id}>
            {p.name}
            <EntityJumpButton jump={{ kind: 'policy', id: p.id, label: p.name }} />
          </span>
        ))}
      </div>

      {fixing && (
        <AiFixModal finding={fixing.finding} policy={fixing.policy} onClose={() => setFixing(null)} />
      )}
    </div>
  );
}

/**
 * The AI design review.
 *
 * Kept as its own section rather than folded into the lint message list, and
 * for one reason worth stating plainly: the lint list feeds errorCount, and
 * errorCount blocks Export. Nothing on this panel is certain enough to stop a
 * deployment. It is a second opinion, and it is presented as one.
 */
export function AiReviewPanel() {
  const proxy = useStore((s) => s.currentProxy)!;
  const aiReview = useStore((s) => s.aiReview);
  const reviewing = useStore((s) => s.reviewing);
  const runAiReview = useStore((s) => s.runAiReview);

  const [aiReady, setAiReady] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (proxy.aiDisabled) {
      setAiReady(false);
      return;
    }
    let cancelled = false;
    api
      .aiStatus()
      .then((s) => !cancelled && setAiReady(s.configured))
      .catch(() => !cancelled && setAiReady(false));
    return () => {
      cancelled = true;
    };
  }, [proxy.aiDisabled]);

  useEffect(() => {
    if (!showPreview) return;
    let cancelled = false;
    api
      .previewAiReview({ proxy })
      .then((p) => !cancelled && setPreview(p))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [showPreview, proxy]);

  if (!aiReady) return null;

  return (
    <div className="card">
      <div className="row-between">
        <div>
          <h4 className="card-title">
            <Icon name="sparkles" size={15} /> AI design review
          </h4>
          <p className="card-subtitle">
            Looks for problems apigeelint cannot see — a quota counted after the call it should
            protect, a cache that doesn't separate callers, a backend with no fault handling.
            Advisory only: nothing here blocks Export, and it is a second opinion, not a verdict.
          </p>
        </div>
        <button className="btn btn-primary" onClick={runAiReview} disabled={reviewing}>
          {reviewing ? <span className="spinner" /> : <Icon name="sparkles" size={14} />}
          {reviewing ? 'Reviewing…' : aiReview ? 'Review again' : 'Review with AI'}
        </button>
      </div>

      <button className="ai-disclosure-toggle" onClick={() => setShowPreview((v) => !v)}>
        <Icon name={showPreview ? 'chevron-down' : 'chevron-right'} size={12} />
        Show exactly what gets sent to Google
      </button>

      {showPreview && (
        <div className="ai-disclosure">
          <p className="field-hint">
            A review sends more than the other AI features: the shape of the whole proxy — every
            policy's name, type and XML, and every step in the order Apigee runs it. It does not
            send where your backends point. Target URLs, TargetServer and KVM names, environment
            names and your proxy's own name and base path were replaced with placeholders before
            sending.
          </p>
          {preview && preview.substitutions.length > 0 ? (
            <ul className="ai-substitutions">
              {preview.substitutions.map((s) => (
                <li key={s.placeholder}>
                  <code>{s.placeholder}</code>
                  <span className="field-hint"> hid {s.characters} characters</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">Nothing in this request needed hiding.</p>
          )}
          {preview ? (
            <>
              <p className="field-hint">System instruction</p>
              <pre className="ai-payload mono">{preview.systemInstruction}</pre>
              <p className="field-hint">Prompt</p>
              <pre className="ai-payload mono">{preview.prompt}</pre>
            </>
          ) : (
            <pre className="ai-payload mono">Loading…</pre>
          )}
        </div>
      )}

      {reviewing && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          Reading the whole proxy, then checking every finding names something that actually exists.
        </p>
      )}

      {aiReview && !reviewing && (
        <div style={{ marginTop: 12 }}>
          {aiReview.summary && <p className="ai-notes">{aiReview.summary}</p>}

          {aiReview.findings.length === 0 ? (
            <div className="ai-verdict is-ok" style={{ marginTop: 10 }}>
              <Icon name="check-circle-2" size={14} />
              <span>Nothing flagged. Worth re-running after the next substantial change.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {aiReview.findings.map((f, i) => (
                <FindingCard key={`${f.title}-${i}`} finding={f} />
              ))}
            </div>
          )}

          {/* Said out loud rather than swallowed: a review that had to discard
              part of its own output is one to trust less, and the user is the
              right person to decide how much less. */}
          {aiReview.dropped > 0 && (
            <p className="field-hint" style={{ marginTop: 10 }}>
              {aiReview.dropped} further finding{aiReview.dropped === 1 ? ' was' : 's were'} discarded
              for naming a policy this proxy doesn't have.
            </p>
          )}
          {aiReview.policiesWithoutXml.length > 0 && (
            <p className="field-hint" style={{ marginTop: 6 }}>
              Reviewed by name and type only, to keep the request a reasonable size:{' '}
              <span className="mono">{aiReview.policiesWithoutXml.join(', ')}</span>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
