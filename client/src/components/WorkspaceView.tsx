import { useWorkspaceStore, type WorkspaceTabKey } from '../store/useWorkspaceStore';
import { Icon } from './Icon';
import { TabBar } from './TabBar';
import { GovernancePanel } from './workspaceTabs/GovernancePanel';
import { BasePathsPanel } from './workspaceTabs/BasePathsPanel';
import { BackendsPanel } from './workspaceTabs/BackendsPanel';
import { SharedFlowUsagePanel } from './workspaceTabs/SharedFlowUsagePanel';

const TABS: { key: WorkspaceTabKey; label: string; icon: string }[] = [
  { key: 'governance', label: 'House Rules', icon: 'gavel' },
  { key: 'basePaths', label: 'Base Paths', icon: 'route' },
  { key: 'backends', label: 'Backends', icon: 'server' },
  { key: 'sharedFlows', label: 'Shared Flow Usage', icon: 'git-branch' },
];

/**
 * Workspace-wide audit — a third top-level view alongside the proxy and shared
 * flow editors. Every question in here needs more than one proxy to answer,
 * which is exactly why none of them can be answered in the Apigee console.
 */
export function WorkspaceView() {
  const audit = useWorkspaceStore((s) => s.audit);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const activeTab = useWorkspaceStore((s) => s.activeTab);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const refresh = useWorkspaceStore((s) => s.refresh);
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);

  const problemCount = (key: WorkspaceTabKey): number => {
    if (!audit) return 0;
    switch (key) {
      case 'governance':
        return audit.governance.findings.filter((f) => f.severity !== 'info').length;
      case 'basePaths':
        return audit.basePaths.conflicts.length;
      case 'backends':
        return 0;
      case 'sharedFlows':
        return (
          audit.sharedFlowUsage.missing.length +
          audit.sharedFlowUsage.cycles.length +
          audit.sharedFlowUsage.empty.filter((e) => e.callerCount > 0).length
        );
    }
  };

  const totalCount = (key: WorkspaceTabKey): number | null => {
    if (!audit) return null;
    switch (key) {
      case 'backends':
        return audit.backends.hosts.length + audit.backends.targetServers.length;
      case 'basePaths':
        return audit.basePaths.map.length;
      case 'sharedFlows':
        return audit.sharedFlowUsage.flows.length;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="proxy-header">
        <div className="proxy-header-top">
          <div>
            <div className="proxy-title-row">
              <h2 className="proxy-title">Workspace</h2>
              {audit && (
                <span className="proxy-basepath">
                  {audit.stats.proxyCount} {audit.stats.proxyCount === 1 ? 'proxy' : 'proxies'} ·{' '}
                  {audit.stats.sharedFlowCount} shared {audit.stats.sharedFlowCount === 1 ? 'flow' : 'flows'}
                </span>
              )}
            </div>
            <p className="proxy-desc">
              Questions that need more than one proxy to answer — which is why none of them can be answered in the
              Apigee console. Reads saved state from disk.
            </p>
          </div>
          <div className="header-actions">
            <button className="btn" onClick={refresh} disabled={loading} title="Re-run the audit">
              {loading ? <span className="spinner" /> : <Icon name="refresh-cw" size={14} />}
              {loading ? 'Auditing…' : 'Refresh'}
            </button>
            <button className="btn btn-ghost" onClick={closeWorkspace} title="Close the workspace view">
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        <TabBar activeKey={activeTab}>
          {TABS.map((t) => {
            const problems = problemCount(t.key);
            const total = totalCount(t.key);
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activeTab === t.key}
                tabIndex={activeTab === t.key ? 0 : -1}
                className={`tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                <Icon name={t.icon} size={14} />
                {t.label}
                {problems > 0 ? (
                  <span className="tab-count" style={{ color: 'var(--error)', background: 'rgba(242, 85, 92, 0.15)' }}>
                    {problems}
                  </span>
                ) : (
                  total != null && total > 0 && <span className="tab-count">{total}</span>
                )}
              </button>
            );
          })}
        </TabBar>
      </div>

      <div className="tab-panel">
        {error && (
          <div className="card" style={{ borderColor: 'rgba(242, 85, 92, 0.4)' }}>
            <h4 className="card-title" style={{ color: 'var(--error)' }}>
              <Icon name="alert-circle" size={15} /> Couldn't audit the workspace
            </h4>
            <p className="card-subtitle">{error}</p>
          </div>
        )}

        {!audit && loading && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="spinner" /> Reading every proxy and shared flow…
          </div>
        )}

        {audit && (
          <>
            {activeTab === 'governance' && <GovernancePanel governance={audit.governance} stats={audit.stats} />}
            {activeTab === 'basePaths' && <BasePathsPanel basePaths={audit.basePaths} />}
            {activeTab === 'backends' && <BackendsPanel backends={audit.backends} />}
            {activeTab === 'sharedFlows' && <SharedFlowUsagePanel usage={audit.sharedFlowUsage} />}
          </>
        )}
      </div>
    </>
  );
}
