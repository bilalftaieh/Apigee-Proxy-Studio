import { Icon } from '../Icon';
import { OpenEntityButton, Row } from './common';
import type { SharedFlowAnalysis, SharedFlowCaller } from '../../types/workspace';

function CallerRow({ caller }: { caller: SharedFlowCaller }) {
  return (
    <div className="entity-row">
      <Icon name={caller.kind === 'proxy' ? 'waypoints' : 'git-branch'} size={13} color="var(--text-3)" />
      <span style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{caller.name}</span>
      <span className="field-hint mono" style={{ flex: 1, minWidth: 0 }}>
        {caller.policyName}
      </span>
      {!caller.attached && (
        <span className="template-badge" style={{ color: 'var(--warning)', background: 'rgba(255, 180, 84, 0.12)', borderColor: 'var(--warning)' }} title="This FlowCallout policy exists but is not wired into any Step, so it never runs">
          not attached
        </span>
      )}
      <OpenEntityButton id={caller.id} name={caller.name} kind={caller.kind} />
    </div>
  );
}

/**
 * The call graph over FlowCallout. Before you change a shared flow, this is
 * the blast radius — and there is no view of it anywhere in Apigee, because
 * the relationship only exists as a string buried inside a policy's XML in a
 * different bundle.
 */
export function SharedFlowUsagePanel({ usage }: { usage: SharedFlowAnalysis }) {
  const { flows, empty, unused, missing, cycles } = usage;
  const emptyInUse = empty.filter((e) => e.callerCount > 0);

  return (
    <div>
      {missing.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(242, 85, 92, 0.4)' }}>
          <h4 className="card-title" style={{ color: 'var(--error)' }}>
            <Icon name="unlink" size={15} /> Called but not defined here ({missing.length})
          </h4>
          <p className="card-subtitle">
            A FlowCallout names a shared flow this workspace doesn't contain. That's fine if it already exists in your
            org — and a hard deploy failure if it doesn't. A leftover template placeholder shows up here too.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {missing.map((f) => (
              <Row severity="error" key={f.name}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                  {f.name}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>
                  called from {f.callers.map((c) => `${c.name} / ${c.policyName}`).join(', ')}
                </span>
                {f.callers.map((c, i) => (
                  <OpenEntityButton key={i} id={c.id} name={c.name} kind={c.kind} />
                ))}
              </Row>
            ))}
          </div>
        </div>
      )}

      {emptyInUse.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(255, 180, 84, 0.4)' }}>
          <h4 className="card-title" style={{ color: 'var(--warning)' }}>
            <Icon name="package-open" size={15} /> Empty, but called ({emptyInUse.length})
          </h4>
          <p className="card-subtitle">
            These shared flows have no steps, so every FlowCallout into them is a no-op. Deploys clean, does nothing —
            the exact failure mode that survives every other check in this tool.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {emptyInUse.map((e) => (
              <Row severity="warning" key={e.id}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                  {e.name}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>
                  no steps, called by {e.callerCount} {e.callerCount === 1 ? 'caller' : 'callers'}
                </span>
                <OpenEntityButton id={e.id} name={e.name} kind="sharedFlow" />
              </Row>
            ))}
          </div>
        </div>
      )}

      {cycles.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(242, 85, 92, 0.4)' }}>
          <h4 className="card-title" style={{ color: 'var(--error)' }}>
            <Icon name="refresh-cw" size={15} /> Call cycles ({cycles.length})
          </h4>
          <p className="card-subtitle">
            A shared flow that reaches itself through FlowCallout recurses at runtime. Apigee accepts the deploy.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {cycles.map((cycle, i) => (
              <Row severity="error" key={i}>
                <span className="mono" style={{ fontSize: 13 }}>
                  {cycle.join(' → ')}
                </span>
              </Row>
            ))}
          </div>
        </div>
      )}

      {unused.length > 0 && (
        <div className="card">
          <h4 className="card-title">
            <Icon name="archive" size={15} /> Called by nothing ({unused.length})
          </h4>
          <p className="card-subtitle">
            Defined in this workspace but no proxy or shared flow here calls it. Legitimate if it's called by something
            outside Studio — otherwise it's dead weight.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {unused.map((u) => (
              <Row severity="info" key={u.name}>
                <span className="mono" style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>
                  {u.name}
                </span>
                <OpenEntityButton id={u.id} name={u.name} kind="sharedFlow" />
              </Row>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h4 className="card-title">
          <Icon name="git-branch" size={15} /> Blast radius
        </h4>
        <p className="card-subtitle">
          Who calls each shared flow, most-used first. Check this before editing one — a change here lands in every
          proxy listed under it, without any of them changing.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          {flows.map((f) => (
            <div key={f.name}>
              <div className="section-label" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="mono">{f.name}</span>
                {!f.definedLocally && (
                  <span className="template-badge" style={{ color: 'var(--error)', background: 'rgba(242, 85, 92, 0.12)', borderColor: 'var(--error)' }}>
                    not in workspace
                  </span>
                )}
                <span className="field-hint">
                  ({f.callers.length} caller{f.callers.length === 1 ? '' : 's'})
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  <OpenEntityButton id={f.localId} name={f.name} kind="sharedFlow" />
                </span>
              </div>
              {f.callers.length === 0 ? (
                <div className="field-hint">Nothing in this workspace calls it.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {f.callers.map((c, i) => (
                    <CallerRow key={`${c.id}-${c.policyName}-${i}`} caller={c} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
