import { useStore } from '../../store/useStore';
import { Icon } from '../Icon';
import { VarValueInput } from '../VarValueInput';
import { TargetServerChips } from '../TargetServerChips';

export function OverviewTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const patchProxy = useStore((s) => s.patchProxy);
  const addEnvironment = useStore((s) => s.addEnvironment);
  const renameEnvironment = useStore((s) => s.renameEnvironment);
  const removeEnvironment = useStore((s) => s.removeEnvironment);
  const setEnvironmentOverride = useStore((s) => s.setEnvironmentOverride);

  return (
    <div>
      <div className="card">
        <h4 className="card-title">
          <Icon name="info" size={15} /> Proxy Details
        </h4>
        <p className="card-subtitle">Basic identity used to name the exported bundle and its base path.</p>
        <div className="field-grid">
          <div className="field">
            <label>Proxy Name</label>
            <input value={proxy.name} onChange={(e) => patchProxy({ name: e.target.value })} />
            <span className="field-hint">Becomes the .zip filename and root apiproxy name.</span>
          </div>
          <div className="field">
            <label>Base Path</label>
            <input value={proxy.basePath} onChange={(e) => patchProxy({ basePath: e.target.value })} />
            <span className="field-hint">The public HTTP path this proxy is exposed on.</span>
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Description</label>
          <textarea value={proxy.description} onChange={(e) => patchProxy({ description: e.target.value })} />
        </div>
      </div>

      <div className="card">
        <h4 className="card-title">
          <Icon name="list-tree" size={15} /> Structure
        </h4>
        <p className="card-subtitle">
          {proxy.targets.length} target endpoint{proxy.targets.length === 1 ? '' : 's'}, {proxy.flows.length} proxy-level
          conditional flow{proxy.flows.length === 1 ? '' : 's'}, {proxy.policies.length} polic
          {proxy.policies.length === 1 ? 'y' : 'ies'}. Configure the ProxyEndpoint and each TargetEndpoint's own
          PreFlow, conditional flows and PostFlow on their respective tabs above.
        </p>
      </div>

      <div className="card">
        <div className="row-between" style={{ marginBottom: 4 }}>
          <div>
            <h4 className="card-title">
              <Icon name="layers-3" size={15} /> Environments
            </h4>
            <p className="card-subtitle">
              Override each target's URL/Target Server/Path per environment (dev, uat, prod, ...). Pick one from the
              dropdown in the header before running Lint, Preview or Export — targets with no override here keep
              their base values.
            </p>
          </div>
          <button className="btn btn-sm" onClick={addEnvironment}>
            <Icon name="plus" size={13} /> Add Environment
          </button>
        </div>

        {proxy.environments.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 2px' }}>
            No environments yet — exports always use each target's base values.
          </div>
        )}

        {proxy.environments.map((env) => (
          <div className="flow-card" key={env.id}>
            <div className="flow-card-head">
              <input className="flow-name" value={env.name} onChange={(e) => renameEnvironment(env.id, e.target.value)} />
              <div style={{ flex: 1 }} />
              <button className="icon-btn" onClick={() => removeEnvironment(env.id)} aria-label="Delete environment">
                <Icon name="trash-2" size={14} />
              </button>
            </div>

            {proxy.targets.map((t) => {
              const override = env.targetOverrides[t.id];
              const enabled = !!override;
              return (
                <div key={t.id} style={{ marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEnvironmentOverride(env.id, t.id, {
                            mode: t.mode,
                            url: t.url,
                            targetServers: t.targetServers,
                            path: t.path,
                          });
                        } else {
                          setEnvironmentOverride(env.id, t.id, null);
                        }
                      }}
                    />
                    Override "{t.name}"
                  </label>

                  {enabled && override && (
                    <div className="entity-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                      <div className="mode-toggle">
                        <button
                          type="button"
                          className={override.mode !== 'targetServer' ? 'active' : ''}
                          onClick={() => setEnvironmentOverride(env.id, t.id, { mode: 'url' })}
                        >
                          URL
                        </button>
                        <button
                          type="button"
                          className={override.mode === 'targetServer' ? 'active' : ''}
                          onClick={() => setEnvironmentOverride(env.id, t.id, { mode: 'targetServer' })}
                        >
                          Target Server
                        </button>
                      </div>

                      {override.mode === 'targetServer' ? (
                        <TargetServerChips
                          value={override.targetServers || []}
                          onChange={(targetServers) => setEnvironmentOverride(env.id, t.id, { targetServers })}
                        />
                      ) : (
                        <VarValueInput
                          value={override.url || { mode: 'literal', value: '' }}
                          onChange={(url) => setEnvironmentOverride(env.id, t.id, { url })}
                          placeholder="https://backend-prod.example.com"
                        />
                      )}

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="field-hint" style={{ flexShrink: 0, width: 132 }}>
                          Path override
                        </span>
                        <VarValueInput
                          value={override.path || { mode: 'literal', value: '' }}
                          onChange={(path) => setEnvironmentOverride(env.id, t.id, { path })}
                          placeholder="/v1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
