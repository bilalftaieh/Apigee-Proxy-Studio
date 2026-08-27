import { useStore } from '../../store/useStore';
import { useSharedFlowStore } from '../../store/useSharedFlowStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { Icon } from '../Icon';
import type { GovernanceSeverity } from '../../types/workspace';

export const SEVERITY_COLOR: Record<GovernanceSeverity, string> = {
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--info)',
};

export const SEVERITY_TINT: Record<GovernanceSeverity, string> = {
  error: 'rgba(242, 85, 92, 0.12)',
  warning: 'rgba(255, 180, 84, 0.12)',
  info: 'rgba(108, 142, 255, 0.12)',
};

export function SeverityBadge({ severity, children }: { severity: GovernanceSeverity; children?: React.ReactNode }) {
  return (
    <span
      className="template-badge"
      style={{ color: SEVERITY_COLOR[severity], background: SEVERITY_TINT[severity], borderColor: SEVERITY_COLOR[severity] }}
    >
      {children ?? severity}
    </span>
  );
}

/**
 * The whole point of an audit row is that you act on it, so every row that
 * names an entity gets a way into it. Opening closes the workspace view, since
 * this is a top-level view rather than a modal — coming back is one click on
 * the sidebar and the audit is re-run fresh, which is the right behaviour
 * anyway once you've just changed something.
 */
export function OpenEntityButton({ id, name, kind = 'proxy' }: { id: string | null; name: string; kind?: 'proxy' | 'sharedFlow' }) {
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);
  if (!id) return null;
  const open = () => {
    closeWorkspace();
    if (kind === 'sharedFlow') useSharedFlowStore.getState().openSharedFlow(id);
    else useStore.getState().openProxy(id);
  };
  return (
    <button className="btn btn-sm btn-ghost" style={{ flexShrink: 0 }} onClick={open} title={`Open ${name}`}>
      <Icon name="arrow-right" size={12} /> Open
    </button>
  );
}

export function EmptyCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <Icon name={icon} size={24} color="var(--text-3)" />
      <h4 style={{ margin: '12px 0 6px' }}>{title}</h4>
      <p className="card-subtitle" style={{ margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

/** A findings card whose left border carries the severity, matching the Lint tab. */
export function Row({ severity, children }: { severity?: GovernanceSeverity; children: React.ReactNode }) {
  return (
    <div
      className="entity-row"
      style={{ alignItems: 'flex-start', borderLeft: severity ? `3px solid ${SEVERITY_COLOR[severity]}` : undefined }}
    >
      {children}
    </div>
  );
}
