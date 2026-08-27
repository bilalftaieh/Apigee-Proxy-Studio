import { useStore } from '../../store/useStore';
import { StepList } from '../StepList';
import { ConditionalFlowsSection } from '../ConditionalFlowsSection';
import { FaultRulesSection } from '../FaultRulesSection';
import { Icon } from '../Icon';
import type { RouteRuleMode } from '../../types/proxy';

export function ProxyEndpointTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const addFlow = useStore((s) => s.addFlow);
  const updateFlow = useStore((s) => s.updateFlow);
  const removeFlow = useStore((s) => s.removeFlow);
  const moveFlow = useStore((s) => s.moveFlow);
  const addRouteRule = useStore((s) => s.addRouteRule);
  const updateRouteRule = useStore((s) => s.updateRouteRule);
  const removeRouteRule = useStore((s) => s.removeRouteRule);
  const addFaultRule = useStore((s) => s.addFaultRule);
  const updateFaultRule = useStore((s) => s.updateFaultRule);
  const removeFaultRule = useStore((s) => s.removeFaultRule);
  const moveFaultRule = useStore((s) => s.moveFaultRule);
  const setSelectedTargetId = useStore((s) => s.setSelectedTargetId);
  const setActiveTab = useStore((s) => s.setActiveTab);

  const jumpToTarget = (targetName: string) => {
    const target = proxy.targets.find((t) => t.name === targetName);
    if (!target) return;
    setSelectedTargetId(target.id);
    setActiveTab('targetEndpoint');
  };

  return (
    <div>
      <div className="phase-strip">
        <span className="phase-strip-item">
          <span className="phase-badge pre">1</span> PreFlow
        </span>
        <Icon className="phase-strip-arrow" name="chevron-right" size={13} />
        <span className="phase-strip-item">
          <span className="phase-badge flows">2</span> Conditional Flows
        </span>
        <Icon className="phase-strip-arrow" name="chevron-right" size={13} />
        <span className="phase-strip-item">
          <span className="phase-badge route">3</span> Route Rule → Target
        </span>
        <Icon className="phase-strip-arrow" name="chevron-right" size={13} />
        <span className="phase-strip-item">
          <span className="phase-badge post">4</span> PostFlow
        </span>
        <Icon className="phase-strip-arrow" name="chevron-right" size={13} />
        <span className="phase-strip-item">
          <span className="phase-badge post">5</span> PostClientFlow
        </span>
        <span className="phase-strip-item dim">Fault Rule runs instead, on error</span>
      </div>

      <div className="card">
        <h4 className="card-title">
          <Icon name="signpost" size={15} /> {proxy.proxyEndpointName || 'default'} · Proxy Endpoint
        </h4>
        <p className="card-subtitle">
          The public-facing side of this proxy — what the caller hits at <code className="mono">{proxy.basePath}</code>.
        </p>
      </div>

      <div className="card">
        <h4 className="card-title">
          <span className="phase-badge pre">1</span>
          <Icon name="arrow-down-to-line" size={15} /> PreFlow
        </h4>
        <p className="card-subtitle">Runs before conditional flow matching — great for auth, rate limiting, CORS.</p>
        <div className="flow-columns">
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-right" size={12} /> Request
            </div>
            <StepList location={{ scope: 'preFlow', phase: 'request' }} steps={proxy.preFlow.request} />
          </div>
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-left" size={12} /> Response
            </div>
            <StepList location={{ scope: 'preFlow', phase: 'response' }} steps={proxy.preFlow.response} />
          </div>
        </div>
      </div>

      <ConditionalFlowsSection
        flows={proxy.flows}
        onAdd={() => addFlow()}
        onUpdate={(id, patch) => updateFlow(id, patch)}
        onRemove={(id) => removeFlow(id)}
        onMove={(id, dir) => moveFlow(id, dir)}
        stepLocation={(flowId, phase) => ({ scope: 'flow', flowId, phase })}
        emptyHint="No conditional flows. Traffic falls through PreFlow → RouteRule → PostFlow."
        phaseNumber={2}
      />

      <div className="card">
        <h4 className="card-title">
          <span className="phase-badge post">4</span>
          <Icon name="arrow-up-from-line" size={15} /> PostFlow
        </h4>
        <p className="card-subtitle">Runs after routing, on the way back — reshape or log the final response.</p>
        <div className="flow-columns">
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-right" size={12} /> Request
            </div>
            <StepList location={{ scope: 'postFlow', phase: 'request' }} steps={proxy.postFlow.request} />
          </div>
          <div>
            <div className="flow-block-title">
              <Icon name="arrow-left" size={12} /> Response
            </div>
            <StepList location={{ scope: 'postFlow', phase: 'response' }} steps={proxy.postFlow.response} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: 4 }}>
          <div>
            <h4 className="card-title">
              <span className="phase-badge route">3</span>
              <Icon name="route" size={15} /> Route Rules
            </h4>
            <p className="card-subtitle">
              Checked top-to-bottom — the first rule whose condition matches (or has none) wins. Route to a named
              Target Endpoint, straight to a URL, or nowhere at all (a <strong>null route</strong>, for when this
              endpoint has already produced the response — a cache hit, say).
            </p>
          </div>
          <button className="btn btn-sm" onClick={addRouteRule}>
            <Icon name="plus" size={13} /> Add Route
          </button>
        </div>
        {proxy.routeRules.length > 0 && (
          <div className="entity-row-head">
            <span style={{ width: 110 }}>Name</span>
            <span style={{ width: 110 }}>Route to</span>
            <span style={{ width: 190 }}>Destination</span>
            <span style={{ flex: 1 }}>Condition (optional)</span>
          </div>
        )}
        {proxy.routeRules.map((rr) => {
          const mode = rr.mode || 'target';
          return (
            <div className="entity-row" key={rr.id}>
              <input
                style={{ width: 110, fontFamily: 'var(--font-mono)' }}
                value={rr.name}
                onChange={(e) => updateRouteRule(rr.id, { name: e.target.value })}
                placeholder="name"
              />
              <select
                style={{ width: 110 }}
                value={mode}
                onChange={(e) => updateRouteRule(rr.id, { mode: e.target.value as RouteRuleMode })}
              >
                <option value="target">Target</option>
                <option value="url">URL</option>
                <option value="null">Nowhere</option>
              </select>
              {mode === 'target' && (
                <div style={{ width: 190, display: 'flex', gap: 4 }}>
                  <select
                    style={{ flex: 1, minWidth: 0 }}
                    value={rr.targetName}
                    onChange={(e) => updateRouteRule(rr.id, { targetName: e.target.value })}
                  >
                    {proxy.targets.map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ flexShrink: 0 }}
                    onClick={() => jumpToTarget(rr.targetName)}
                    disabled={!proxy.targets.some((t) => t.name === rr.targetName)}
                    aria-label={`View target "${rr.targetName}"`}
                    title={`View target "${rr.targetName}"`}
                  >
                    <Icon name="external-link" size={13} />
                  </button>
                </div>
              )}
              {mode === 'url' && (
                <input
                  style={{ width: 190, fontFamily: 'var(--font-mono)' }}
                  value={rr.url || ''}
                  onChange={(e) => updateRouteRule(rr.id, { url: e.target.value })}
                  placeholder="https://api.example.com/v2"
                />
              )}
              {mode === 'null' && (
                <span style={{ width: 190, fontSize: 11, color: 'var(--text-3)' }}>No backend call</span>
              )}
              <input
                style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                value={rr.condition || ''}
                onChange={(e) => updateRouteRule(rr.id, { condition: e.target.value })}
                placeholder='e.g. request.header.X-Env = "canary" — leave blank to always match'
              />
              <button
                className="icon-btn"
                onClick={() => removeRouteRule(rr.id)}
                disabled={proxy.routeRules.length <= 1}
                aria-label="Remove route"
              >
                <Icon name="trash-2" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h4 className="card-title">
          <span className="phase-badge post">5</span>
          <Icon name="send-horizontal" size={15} /> PostClientFlow
        </h4>
        <p className="card-subtitle">
          Runs <em>after</em> the response has already reached the client, so nothing here adds latency for the caller.
          Apigee only allows Message Logging steps in this flow — it's also the only place where{' '}
          <code className="mono">client.sent.start.timestamp</code> and{' '}
          <code className="mono">client.sent.end.timestamp</code> are populated.
        </p>
        <div className="flow-block-title">
          <Icon name="arrow-left" size={12} /> Response
        </div>
        <StepList
          location={{ scope: 'postClientFlow', phase: 'response' }}
          steps={proxy.postClientFlow?.response ?? []}
        />
      </div>

      <FaultRulesSection
        faultRules={proxy.faultRules}
        scopeLabel="this proxy endpoint"
        onAdd={() => addFaultRule()}
        onUpdate={(id, patch) => updateFaultRule(id, patch)}
        onRemove={(id) => removeFaultRule(id)}
        onMove={(id, direction) => moveFaultRule(id, direction)}
        ruleStepLocation={(ruleId) => ({ scope: 'faultRule', ruleId, phase: 'steps' })}
        defaultStepLocation={{ scope: 'faultRules', phase: 'steps' }}
      />
    </div>
  );
}
