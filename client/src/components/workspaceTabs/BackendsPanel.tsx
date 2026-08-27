import { Icon } from '../Icon';
import { EmptyCard, OpenEntityButton } from './common';
import type { BackendAnalysis, BackendUsage } from '../../types/workspace';

function UsageRow({ usage }: { usage: BackendUsage }) {
  return (
    <div className="entity-row">
      <span style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{usage.name}</span>
      <span className="field-hint" style={{ flexShrink: 0 }}>
        {usage.where}
      </span>
      {usage.environment && (
        <span className="template-badge" title="Only in this environment's target override">
          {usage.environment}
        </span>
      )}
      <span className="mono field-hint" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={usage.detail}>
        {usage.detail}
      </span>
      <OpenEntityButton id={usage.id} name={usage.name} />
    </div>
  );
}

/**
 * Reverse index: backend -> the proxies that call it. Answers "I'm changing
 * this service, what breaks?" — which in the console requires opening every
 * proxy in turn and reading its target configuration.
 *
 * Environment overrides are resolved, so a target that differs per environment
 * appears once per distinct backend it can reach, tagged with the environment.
 * Targets that resolve the same everywhere appear once, untagged.
 */
export function BackendsPanel({ backends }: { backends: BackendAnalysis }) {
  const { hosts, targetServers, dynamic } = backends;
  const nothing = !hosts.length && !targetServers.length && !dynamic.length;

  if (nothing) {
    return <EmptyCard icon="server-off" title="No backends found" body="No proxy in this workspace defines a target URL or Target Server." />;
  }

  return (
    <div>
      {targetServers.length > 0 && (
        <div className="card">
          <h4 className="card-title">
            <Icon name="server" size={15} /> Target Servers ({targetServers.length})
          </h4>
          <p className="card-subtitle">
            Named per environment in the org, so the host they point at isn't in any bundle. This is who depends on each
            name — rename or delete one in the console and every proxy listed under it 503s.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {targetServers.map((ts) => (
              <div key={ts.name}>
                <div className="section-label" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono">{ts.name}</span>
                  <span className="field-hint">
                    ({ts.usages.length} user{ts.usages.length === 1 ? '' : 's'})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ts.usages.map((u, i) => (
                    <UsageRow key={`${u.id}-${u.where}-${i}`} usage={u} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hosts.length > 0 && (
        <div className="card">
          <h4 className="card-title">
            <Icon name="globe" size={15} /> Direct hosts ({hosts.length})
          </h4>
          <p className="card-subtitle">Targets and RouteRules that call a literal URL rather than going through a Target Server.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {hosts.map((h) => (
              <div key={h.key}>
                <div className="section-label" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ color: h.scheme === 'http' ? 'var(--warning)' : undefined }}>
                    {h.key}
                  </span>
                  {h.scheme === 'http' && (
                    <span className="field-hint" style={{ color: 'var(--warning)' }}>
                      plain http
                    </span>
                  )}
                  <span className="field-hint">
                    ({h.usages.length} user{h.usages.length === 1 ? '' : 's'})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {h.usages.map((u, i) => (
                    <UsageRow key={`${u.id}-${u.where}-${i}`} usage={u} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dynamic.length > 0 && (
        <div className="card">
          <h4 className="card-title">
            <Icon name="shuffle" size={15} /> Runtime-resolved endpoints ({dynamic.length})
          </h4>
          <p className="card-subtitle">
            The host itself is a flow variable, so these name no single backend and can't be indexed. Listed so the map
            above is honest about what it doesn't cover.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
            {dynamic.map((u, i) => (
              <UsageRow key={`${u.id}-${u.where}-${i}`} usage={u} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
