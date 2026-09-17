import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import { Icon } from '../Icon';
import { AiFixModal, type FixableFinding } from '../AiFixModal';
import { AiReviewPanel } from '../AiReviewPanel';
import { PrerequisitesPanel } from '../PrerequisitesPanel';
import { EntityJumpButton } from '../EntityJumpButton';
import { findEntityJump } from '../../lib/entityLinks';
import { findFixablePolicy } from '../../lib/aiFix';
import type { Policy } from '../../types/proxy';

export function LintTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const linting = useStore((s) => s.linting);
  const lintResult = useStore((s) => s.lintResult);
  const runLint = useStore((s) => s.runLint);
  const toggleLintExclude = useStore((s) => s.toggleLintExclude);

  const [fixing, setFixing] = useState<{ finding: FixableFinding; policy: Policy } | null>(null);
  // Null until the status call lands, so the button doesn't flicker in and then
  // out again on a workspace where AI isn't configured.
  const [aiReady, setAiReady] = useState<boolean | null>(null);

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

  return (
    <div>
      <div className="card">
        <div className="row-between">
          <div>
            <h4 className="card-title">
              <Icon name="scan-line" size={15} /> Apigeelint
            </h4>
            <p className="card-subtitle">
              Runs the community <code className="mono">apigeelint</code> tool (Apigee X profile) against this
              proxy's generated bundle. Export is blocked while errors remain — warnings are fine to ship with.
            </p>
          </div>
          <button className="btn btn-primary" onClick={runLint} disabled={linting}>
            {linting ? <span className="spinner" /> : <Icon name="scan-line" size={14} />}
            {linting ? 'Linting…' : 'Run Lint'}
          </button>
        </div>
        {linting && <p className="field-hint" style={{ marginTop: 10 }}>Apigeelint's first pass can take up to ~15 seconds — it's spinning up its rule engine, not stuck.</p>}
        {proxy.lintExcludes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="section-label" style={{ marginTop: 0 }}>
              Excluded rules
            </div>
            <div className="chip-list">
              {proxy.lintExcludes.map((ruleId) => (
                <span className="chip mono" key={ruleId}>
                  {ruleId}
                  <button onClick={() => toggleLintExclude(ruleId)} aria-label={`Re-enable ${ruleId}`} title="Re-enable this rule">
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {!lintResult && !linting && (
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <Icon name="scan-line" size={26} color="var(--text-3)" />
          <h4 style={{ margin: '14px 0 6px' }}>Not linted yet</h4>
          <p className="card-subtitle" style={{ margin: 0 }}>
            Click "Run Lint" to check this proxy, or just hit Export — it runs automatically before every export.
          </p>
        </div>
      )}

      {lintResult && !lintResult.ok && (
        <div className="card" style={{ borderColor: 'var(--error)' }}>
          <h4 className="card-title" style={{ color: 'var(--error)' }}>
            <Icon name="alert-circle" size={15} /> Couldn't run apigeelint
          </h4>
          <pre
            className="mono"
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              color: 'var(--text-1)',
              background: 'var(--bg-2)',
              padding: 12,
              borderRadius: 'var(--radius-md)',
              marginTop: 10,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {lintResult.systemError}
          </pre>
        </div>
      )}

      {lintResult?.ok && (
        <>
          <div className="lint-summary" data-state={lintResult.errorCount > 0 ? 'error' : lintResult.warningCount > 0 ? 'warning' : 'clean'}>
            <Icon
              name={lintResult.errorCount > 0 ? 'x-circle' : lintResult.warningCount > 0 ? 'alert-triangle' : 'check-circle-2'}
              size={16}
            />
            <span className="lint-summary-counts">
              <span className="lint-count" data-severity="error">
                {lintResult.errorCount} error{lintResult.errorCount === 1 ? '' : 's'}
              </span>
              <span className="lint-count" data-severity="warning">
                {lintResult.warningCount} warning{lintResult.warningCount === 1 ? '' : 's'}
              </span>
              <span className="lint-count">
                {lintResult.files.length} file{lintResult.files.length === 1 ? '' : 's'}
              </span>
            </span>
            <span className="lint-summary-verdict">
              {lintResult.errorCount > 0 ? 'Export is blocked until these are resolved.' : 'Ready to export.'}
            </span>
          </div>

          {lintResult.files.map((file) => (
            <div className="lint-file" key={file.filePath}>
              <div className="lint-file-head">
                <Icon name="file-code" size={13} />
                <span className="mono">{file.filePath}</span>
                <span className="lint-file-count">{file.messages.length}</span>
              </div>
              <div className="lint-rows">
                {file.messages.map((m, i) => {
                  const jump = findEntityJump(m.message, proxy);
                  // Only findings that belong to one policy file can be fixed
                  // this way — see lib/aiFix. Everything else is a proxy-model
                  // edit the owning tab already does in one click.
                  const fixablePolicy = aiReady ? findFixablePolicy(proxy, { ...m, filePath: file.filePath }) : null;
                  return (
                  <div key={i} className="lint-row" data-severity={m.severity}>
                    <span className="lint-row-sev">{m.severity}</span>
                    <span className="lint-row-loc mono">
                      {m.line != null ? `${m.line}:${m.column ?? 0}` : '—'}
                    </span>
                    <span className="lint-row-msg">{m.message}</span>
                    {jump && <EntityJumpButton jump={jump} />}
                    {fixablePolicy && (
                      <button
                        className="btn btn-sm btn-ghost"
                        style={{ flexShrink: 0 }}
                        onClick={() => setFixing({ finding: { ...m, filePath: file.filePath }, policy: fixablePolicy })}
                        title={`Propose a fix for ${fixablePolicy.name}`}
                      >
                        <Icon name="sparkles" size={12} /> Fix with AI
                      </button>
                    )}
                    {m.ruleId && (
                      <>
                        <span className="field-hint mono" style={{ flexShrink: 0 }}>
                          {m.ruleId}
                        </span>
                        <button
                          className="btn btn-sm btn-ghost"
                          style={{ flexShrink: 0 }}
                          onClick={() => toggleLintExclude(m.ruleId!)}
                          title={`Exclude ${m.ruleId} from future lint runs`}
                        >
                          Exclude
                        </button>
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <AiReviewPanel />

      <PrerequisitesPanel />

      {fixing && (
        <AiFixModal finding={fixing.finding} policy={fixing.policy} onClose={() => setFixing(null)} />
      )}
    </div>
  );
}
