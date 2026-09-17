import { useCallback, useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import { setupApigeeMonaco } from '../lib/monacoApigee';
import type { AiFixResult, AiPreview, LintMessage, Policy } from '../types/proxy';

export type FixableFinding = LintMessage & { filePath: string };

/**
 * Proposes a repair for one lint finding.
 *
 * Unlike the generate modal there is nothing to type: the finding IS the
 * prompt, so the request goes out as soon as this opens. What the user is here
 * to do is judge the answer, which is why the diff and the verification verdict
 * get the space rather than any input control.
 */
export function AiFixModal({
  finding,
  policy,
  onClose,
}: {
  finding: FixableFinding;
  policy: Policy;
  onClose: () => void;
}) {
  const currentProxy = useStore((s) => s.currentProxy);
  const applyAiFix = useStore((s) => s.applyAiFix);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiFixResult | null>(null);
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const run = useCallback(async () => {
    if (!currentProxy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.generateAiFix({ proxy: currentProxy, finding }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [currentProxy, finding]);

  // The finding never changes while this modal is open — it is what the modal
  // is about — so this runs exactly once, on open.
  useEffect(() => {
    void run();
  }, [run]);

  // Same contract as the generate modal's panel: built from the identical input
  // the real call uses, so it cannot describe a request that would not be sent.
  useEffect(() => {
    if (!showPreview || !currentProxy) return;
    let cancelled = false;
    api
      .previewAiFix({ proxy: currentProxy, finding })
      .then((p) => !cancelled && setPreview(p))
      .catch(() => !cancelled && setPreview(null));
    return () => {
      cancelled = true;
    };
  }, [showPreview, currentProxy, finding]);

  const accept = async () => {
    if (!result) return;
    await applyAiFix(result.policyId, result.xml);
    onClose();
  };

  const verification = result?.verification;

  return (
    <Modal title={`Fix ${policy.name}`} onClose={onClose} xl>
      <div className="ai-modal">
        <div className="ai-finding">
          <span className="template-badge mono">{finding.ruleId ?? 'lint'}</span>
          <span>{finding.message}</span>
        </div>

        <button className="ai-disclosure-toggle" onClick={() => setShowPreview((v) => !v)}>
          <Icon name={showPreview ? 'chevron-down' : 'chevron-right'} size={12} />
          Show exactly what gets sent to Google
        </button>

        {showPreview && (
          <div className="ai-disclosure">
            <p className="field-hint">
              Fixing a policy means sending that policy's XML — this is more than generating one
              needs, and it is the whole of the extra. Nothing about your other policies, flows or
              targets is included. Target URLs, TargetServer and KVM names inside the XML below were
              replaced with placeholders before sending, and are restored in the result.
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

        {busy && (
          <p className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner" /> Proposing a fix, then re-checking the proxy with it in place…
          </p>
        )}

        {error && (
          <div className="ai-error">
            <Icon name="alert-triangle" size={14} />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="ai-result">
            <div className="ai-result-head">
              <div>
                <strong>{result.policyName}</strong>
                <span className="field-hint"> · {result.policyType}</span>
                {result.attempts > 1 && (
                  <span className="field-hint"> · corrected after a failed first draft</span>
                )}
              </div>
              <div className="ai-result-actions">
                <button className="btn btn-ghost btn-sm" onClick={run} disabled={busy}>
                  <Icon name="refresh-cw" size={13} /> Retry
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={accept}
                  disabled={busy || result.unchanged}
                  title={result.unchanged ? 'There is nothing to apply — the policy is unchanged' : undefined}
                >
                  <Icon name="check" size={13} /> Apply
                </button>
              </div>
            </div>

            {result.notes && <p className="ai-notes">{result.notes}</p>}

            {/* The verdict, stated as what was actually established rather than
                as what the model said it did. Ordered so the user reads the
                strongest true statement first. */}
            {result.unchanged && (
              <div className="ai-verdict">
                <Icon name="info" size={14} />
                <span>
                  The policy came back unchanged — this one can't be fixed from inside it alone.
                  The note above says what it needs instead.
                </span>
              </div>
            )}

            {!result.unchanged && verification?.resolved === true && result.ok && (
              <div className="ai-verdict is-ok">
                <Icon name="check-circle-2" size={14} />
                <span>
                  Re-checked: <strong>{finding.ruleId}</strong> is gone with this change applied, and
                  no new deploy blocker appeared.
                </span>
              </div>
            )}

            {!result.unchanged && verification?.recheckable === false && result.ok && (
              <div className="ai-verdict">
                <Icon name="info" size={14} />
                <span>
                  Not re-checked — this is an apigeelint rule, which needs a full lint run. Nothing
                  else broke, and Lint re-runs automatically when you apply.
                </span>
              </div>
            )}

            {!result.ok && (
              <div className="ai-warnings">
                <Icon name="alert-triangle" size={14} />
                <div>
                  <strong>This did not pass the checks — review it before applying.</strong>
                  <ul>
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="ai-diff">
              <DiffEditor
                original={result.original}
                modified={result.xml}
                language="xml"
                theme="apigee-dark"
                beforeMount={setupApigeeMonaco}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                }}
              />
            </div>
            <p className="field-hint">
              Left: the policy as it is now. Right: the proposed fix. Applying replaces this one
              policy — nothing else in the proxy is touched.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
