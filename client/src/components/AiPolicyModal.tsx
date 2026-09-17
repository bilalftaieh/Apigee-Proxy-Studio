import { useEffect, useMemo, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { api } from '../api/client';
import { useStore } from '../store/useStore';
import { setupApigeeMonaco } from '../lib/monacoApigee';
import { suggestPolicyName } from '../lib/policyNames';
import type { AiPolicyResult, AiPreview } from '../types/proxy';

// Long enough to let a phrase land, short enough that the panel still feels
// live while you type.
const PREVIEW_DEBOUNCE_MS = 350;

const EXAMPLES = [
  'cache successful responses for 5 minutes, keyed by client id',
  'limit each developer app to 1000 calls per hour',
  'verify the JWT in the Authorization header against a JWKS endpoint',
  'strip internal headers from the response before it goes out',
];

export function AiPolicyModal({ onClose }: { onClose: () => void }) {
  const currentProxy = useStore((s) => s.currentProxy);
  const policyTypes = useStore((s) => s.policyTypes);
  const addGeneratedPolicy = useStore((s) => s.addGeneratedPolicy);

  const [intent, setIntent] = useState('');
  const [policyType, setPolicyType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiPolicyResult | null>(null);
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // The generated policy is diffed against the blank template for its type, so
  // the view answers the question the user actually has — "what did it decide?"
  // — instead of showing every line as new.
  const [template, setTemplate] = useState('');

  useEffect(() => {
    if (!result) return;
    api
      .getPolicyDefaults(result.policyType, result.name)
      .then((d) => setTemplate(d.xml))
      .catch(() => setTemplate(''));
  }, [result]);

  // Refreshed whenever its inputs change, so the disclosure panel can never be
  // stale relative to what Generate would actually send.
  //
  // Debounced because `intent` changes on every keystroke and the request body
  // carries the whole proxy: undebounced, opening this panel and typing a
  // sentence meant one POST, one full serialization of the workspace and one
  // prompt build per character typed.
  useEffect(() => {
    if (!showPreview || !intent.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .previewAiRequest({ intent, policyType: policyType || null, proxy: currentProxy })
        .then((p) => !cancelled && setPreview(p))
        .catch(() => !cancelled && setPreview(null));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showPreview, intent, policyType, currentProxy]);

  const sortedTypes = useMemo(
    () => [...policyTypes].sort((a, b) => a.label.localeCompare(b.label)),
    [policyTypes]
  );

  const generate = async () => {
    if (!intent.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.generateAiPolicy({ intent, policyType: policyType || null, proxy: currentProxy }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    if (!result || !currentProxy) return;
    // The model's chosen name can collide with something already here; fall
    // back to the same numbering the policy gallery uses.
    const taken = currentProxy.policies.some((p) => p.name === result.name);
    const name = taken ? suggestPolicyName(result.policyType, currentProxy.policies) : result.name;
    addGeneratedPolicy(result.policyType, name, result.xml);
    onClose();
  };

  return (
    <Modal title="Generate a policy" onClose={onClose} xl>
      <div className="ai-modal">
        {/* `.field` is the app's form-control wrapper: app.css styles inputs via
            `.field input/textarea/select`, so a control outside one falls back to
            browser defaults. */}
        <div className="field">
          <label htmlFor="ai-intent">Describe what the policy should do</label>
          <textarea
            id="ai-intent"
            rows={3}
            autoFocus
            value={intent}
            placeholder="e.g. cache successful responses for 5 minutes, keyed by client id"
            onChange={(e) => setIntent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate();
            }}
          />
          <span className="field-hint">
            Plain English. Ctrl+Enter generates.
          </span>
        </div>

        {!result && (
          <div className="ai-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="ai-example" onClick={() => setIntent(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="ai-controls">
          <div className="field">
            <label htmlFor="ai-type">Policy type</label>
            <select id="ai-type" value={policyType} onChange={(e) => setPolicyType(e.target.value)}>
              <option value="">Let the model choose</option>
              {sortedTypes.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy || !intent.trim()} onClick={generate}>
            {busy ? <span className="spinner" /> : <Icon name="sparkles" size={14} />}
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>

        <button className="ai-disclosure-toggle" onClick={() => setShowPreview((v) => !v)}>
          <Icon name={showPreview ? 'chevron-down' : 'chevron-right'} size={12} />
          Show exactly what gets sent to Google
        </button>

        {showPreview && (
          <div className="ai-disclosure">
            <p className="field-hint">
              Your proxy name, basepath, target URLs, TargetServer and KVM names, and existing policy
              XML are never included. Anything listed below was replaced with a placeholder before
              sending, and is restored in the result.
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
                {/* Both halves, because "exactly what gets sent" was showing
                    only the prompt while the system instruction — which is
                    just as much a part of the request — went unmentioned. */}
                <p className="field-hint">System instruction</p>
                <pre className="ai-payload mono">{preview.systemInstruction}</pre>
                <p className="field-hint">Prompt</p>
                <pre className="ai-payload mono">{preview.prompt}</pre>
              </>
            ) : (
              <pre className="ai-payload mono">Type a description above…</pre>
            )}
          </div>
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
                <strong>{result.name}</strong>
                <span className="field-hint"> · {result.policyType}</span>
                {result.attempts > 1 && (
                  <span className="field-hint"> · corrected after a failed first draft</span>
                )}
              </div>
              <div className="ai-result-actions">
                <button className="btn btn-ghost btn-sm" onClick={generate} disabled={busy}>
                  <Icon name="refresh-cw" size={13} /> Regenerate
                </button>
                <button className="btn btn-primary btn-sm" onClick={accept}>
                  <Icon name="check" size={13} /> Accept
                </button>
              </div>
            </div>

            {result.notes && <p className="ai-notes">{result.notes}</p>}

            {!result.ok && (
              <div className="ai-warnings">
                <Icon name="alert-triangle" size={14} />
                <div>
                  <strong>This did not pass validation — review it before accepting.</strong>
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
                original={template}
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
              Left: the blank template for this policy type. Right: what was generated.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
