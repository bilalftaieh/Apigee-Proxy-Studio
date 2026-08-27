import { Icon } from '../Icon';
import { OpenEntityButton, Row } from './common';
import type { BasePathAnalysis } from '../../types/workspace';

/**
 * Base paths must be unique within an environment — a second proxy on a base
 * path another proxy already holds simply fails to deploy. Nothing in the
 * console warns about it, because the console never shows two proxies at once.
 */
export function BasePathsPanel({ basePaths }: { basePaths: BasePathAnalysis }) {
  const { map, conflicts, nested, wildcards } = basePaths;

  return (
    <div>
      {conflicts.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(242, 85, 92, 0.4)' }}>
          <h4 className="card-title" style={{ color: 'var(--error)' }}>
            <Icon name="x-circle" size={15} /> {conflicts.length} base path conflict{conflicts.length === 1 ? '' : 's'}
          </h4>
          <p className="card-subtitle">
            Two proxies cannot hold the same base path in the same environment. Whichever deploys second is rejected —
            so this only surfaces at deploy time, and only for one of the two.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {conflicts.map((c) => (
              <Row severity="error" key={c.basePath}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                  {c.basePath}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>
                  claimed by {c.proxies.map((p) => p.name).join(', ')}
                </span>
                {c.proxies.map((p) => (
                  <OpenEntityButton key={p.id} id={p.id} name={p.name} />
                ))}
              </Row>
            ))}
          </div>
        </div>
      )}

      {nested.length > 0 && (
        <div className="card">
          <h4 className="card-title">
            <Icon name="git-fork" size={15} /> Nested base paths
          </h4>
          <p className="card-subtitle">
            Legal, and often intentional — Apigee routes on the longest match. Listed because the consequence is easy to
            miss: any flow in the shorter proxy that expects to serve the nested path will never fire.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {nested.map((n) => (
              <Row severity="info" key={n.basePath}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {n.basePath}
                    </span>{' '}
                    <span className="field-hint">({n.proxies.map((p) => p.name).join(', ')})</span>
                  </div>
                  <div className="field-hint" style={{ marginTop: 3 }}>
                    yields traffic under{' '}
                    {n.shadowed.map((s) => `${s.basePath} (${s.proxies.map((p) => p.name).join(', ')})`).join(', ')}
                  </div>
                </div>
              </Row>
            ))}
          </div>
        </div>
      )}

      {wildcards.length > 0 && (
        <div className="card">
          <h4 className="card-title">
            <Icon name="asterisk" size={15} /> Wildcard base paths
          </h4>
          <p className="card-subtitle">
            A <code className="mono">*</code> in a base path is matched at runtime, so no string comparison can tell you
            whether these overlap with anything else. Excluded from the conflict check above rather than being silently
            assumed clean.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {wildcards.map((w) => (
              <Row severity="info" key={w.id}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>
                  {w.basePath}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>{w.name}</span>
                <OpenEntityButton id={w.id} name={w.name} />
              </Row>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h4 className="card-title">
          <Icon name="route" size={15} /> Routing map
        </h4>
        <p className="card-subtitle">
          Every API surface this workspace exposes, in one list. There is no equivalent view anywhere in the console —
          it shows you one proxy at a time.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          {map.map((entry) => (
            <div className="entity-row" key={entry.id}>
              <span className="mono" style={{ fontWeight: 600, fontSize: 13, minWidth: 220 }}>
                {entry.basePath}
              </span>
              <span style={{ flex: 1, fontSize: 12.5 }}>{entry.name}</span>
              {entry.raw !== entry.basePath && (
                <span className="field-hint mono" title="Stored on the proxy in a different form">
                  stored as {entry.raw || '(empty)'}
                </span>
              )}
              <OpenEntityButton id={entry.id} name={entry.name} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
