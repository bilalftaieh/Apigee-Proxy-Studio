import { useSharedFlowStore } from '../../store/useSharedFlowStore';
import { Icon } from '../Icon';

export function SharedFlowLintPanel() {
  const sharedFlow = useSharedFlowStore((s) => s.currentSharedFlow)!;
  const linting = useSharedFlowStore((s) => s.linting);
  const lintResult = useSharedFlowStore((s) => s.lintResult);
  const runLint = useSharedFlowStore((s) => s.runLint);
  const toggleLintExclude = useSharedFlowStore((s) => s.toggleLintExclude);

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
              shared flow's generated bundle. Export is blocked while errors remain — warnings are fine to ship with.
            </p>
          </div>
          <button className="btn btn-primary" onClick={runLint} disabled={linting}>
            {linting ? <span className="spinner" /> : <Icon name="scan-line" size={14} />}
            {linting ? 'Linting…' : 'Run Lint'}
          </button>
        </div>
        {linting && <p className="field-hint" style={{ marginTop: 10 }}>Apigeelint's first pass can take up to ~15 seconds — it's spinning up its rule engine, not stuck.</p>}
        {sharedFlow.lintExcludes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="section-label" style={{ marginTop: 0 }}>
              Excluded rules
            </div>
            <div className="chip-list">
              {sharedFlow.lintExcludes.map((ruleId) => (
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
            Click "Run Lint" to check this shared flow, or just hit Export — it runs automatically before every export.
          </p>
        </div>
      )}

      {lintResult && !lintResult.ok && (
        <div className="card" style={{ borderColor: 'rgba(242, 85, 92, 0.4)' }}>
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
          <div
            className="card"
            style={{
              borderColor:
                lintResult.errorCount > 0
                  ? 'rgba(242, 85, 92, 0.4)'
                  : lintResult.warningCount > 0
                  ? 'rgba(255, 180, 84, 0.4)'
                  : 'rgba(47, 212, 143, 0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Icon
                name={lintResult.errorCount > 0 ? 'x-circle' : lintResult.warningCount > 0 ? 'alert-triangle' : 'check-circle-2'}
                size={20}
                color={
                  lintResult.errorCount > 0
                    ? 'var(--error)'
                    : lintResult.warningCount > 0
                    ? 'var(--warning)'
                    : 'var(--success)'
                }
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {lintResult.errorCount > 0
                    ? `${lintResult.errorCount} error${lintResult.errorCount === 1 ? '' : 's'}, ${lintResult.warningCount} warning${lintResult.warningCount === 1 ? '' : 's'}`
                    : lintResult.warningCount > 0
                    ? `Clean — ${lintResult.warningCount} warning${lintResult.warningCount === 1 ? '' : 's'} only`
                    : 'Clean — no issues found'}
                </div>
                <div className="field-hint">
                  {lintResult.errorCount > 0 ? 'Export is blocked until these are resolved.' : 'Ready to export.'}
                </div>
              </div>
            </div>
          </div>

          {lintResult.files.map((file) => (
            <div className="card" key={file.filePath}>
              <h4 className="card-title mono" style={{ fontSize: 12.5 }}>
                <Icon name="file-code" size={14} /> {file.filePath}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {file.messages.map((m, i) => (
                  <div
                    key={i}
                    className="entity-row"
                    style={{
                      alignItems: 'flex-start',
                      borderLeft: `3px solid ${m.severity === 'error' ? 'var(--error)' : 'var(--warning)'}`,
                    }}
                  >
                    <span
                      className="template-badge"
                      style={
                        m.severity === 'error'
                          ? { color: 'var(--error)', background: 'rgba(242, 85, 92, 0.1)', borderColor: 'rgba(242, 85, 92, 0.3)' }
                          : { color: 'var(--warning)', background: 'rgba(255, 180, 84, 0.1)', borderColor: 'rgba(255, 180, 84, 0.3)' }
                      }
                    >
                      {m.severity}
                    </span>
                    <span className="mono field-hint" style={{ flexShrink: 0 }}>
                      {m.line != null ? `${m.line}:${m.column ?? 0}` : '—'}
                    </span>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{m.message}</span>
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
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
