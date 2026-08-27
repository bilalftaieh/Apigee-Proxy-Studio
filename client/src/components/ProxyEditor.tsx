import { useState } from 'react';
import { useStore, type TabKey } from '../store/useStore';
import { Icon } from './Icon';
import { TabBar } from './TabBar';
import { ExportMenu } from './ExportMenu';
import { OverviewTab } from './tabs/OverviewTab';
import { ProxyEndpointTab } from './tabs/ProxyEndpointTab';
import { TargetEndpointTab } from './tabs/TargetEndpointTab';
import { FlowDiagramTab } from './tabs/FlowDiagramTab';
import { PoliciesTab } from './tabs/PoliciesTab';
import { ResourcesTab } from './tabs/ResourcesTab';
import { TestsTab } from './tabs/TestsTab';
import { LintTab } from './tabs/LintTab';
import { PreviewTab } from './tabs/PreviewTab';
import { SaveAsTemplateModal } from './SaveAsTemplateModal';
import { HistoryModal } from './HistoryModal';
import { DriftCompareModal } from './DriftCompareModal';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { key: 'proxyEndpoint', label: 'Proxy Endpoint', icon: 'signpost' },
  { key: 'targetEndpoint', label: 'Target Endpoint', icon: 'server' },
  { key: 'flowDiagram', label: 'Flow Diagram', icon: 'workflow' },
  { key: 'policies', label: 'Policies', icon: 'shield' },
  { key: 'resources', label: 'Resources', icon: 'folder-code' },
  { key: 'tests', label: 'Test', icon: 'flask-conical' },
  { key: 'lint', label: 'Lint', icon: 'scan-line' },
  { key: 'preview', label: 'XML Preview', icon: 'file-code' },
];

export function ProxyEditor() {
  const proxy = useStore((s) => s.currentProxy)!;
  const dirty = useStore((s) => s.dirty);
  const saving = useStore((s) => s.saving);
  const linting = useStore((s) => s.linting);
  const lintResult = useStore((s) => s.lintResult);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const saveProxy = useStore((s) => s.saveProxy);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const undoDepth = useStore((s) => s.undoDepth);
  const redoDepth = useStore((s) => s.redoDepth);
  const selectedEnvironmentId = useStore((s) => s.selectedEnvironmentId);
  const setSelectedEnvironmentId = useStore((s) => s.setSelectedEnvironmentId);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDriftCompare, setShowDriftCompare] = useState(false);

  return (
    <>
      <div className="proxy-header">
        <div className="proxy-header-top">
          <div>
            <div className="proxy-title-row">
              <h2 className="proxy-title">{proxy.name}</h2>
              <span className="proxy-basepath">{proxy.basePath}</span>
              {dirty && <span className="dirty-dot" title="Unsaved changes" />}
            </div>
            {proxy.description && <p className="proxy-desc">{proxy.description}</p>}
          </div>
          <div className="header-actions">
            {proxy.environments.length > 0 && (
              <select
                value={selectedEnvironmentId || ''}
                onChange={(e) => setSelectedEnvironmentId(e.target.value || null)}
                title="Environment used for Lint/Preview/Export"
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 10px',
                  fontSize: 13,
                  color: 'var(--text-0)',
                }}
              >
                <option value="">Base (no environment)</option>
                {proxy.environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn"
              onClick={undo}
              disabled={undoDepth === 0}
              title={undoDepth === 0 ? 'Nothing to undo' : `Undo (Ctrl+Z) — ${undoDepth} step${undoDepth === 1 ? '' : 's'}`}
            >
              <Icon name="undo-2" size={14} />
            </button>
            <button
              className="btn"
              onClick={redo}
              disabled={redoDepth === 0}
              title={redoDepth === 0 ? 'Nothing to redo' : `Redo (Ctrl+Shift+Z) — ${redoDepth} step${redoDepth === 1 ? '' : 's'}`}
            >
              <Icon name="redo-2" size={14} />
            </button>
            <button className="btn" onClick={() => setShowHistory(true)} title="View and restore past saves">
              <Icon name="history" size={14} />
            </button>
            <button className="btn" onClick={() => setShowDriftCompare(true)} title="Compare with a bundle downloaded from Apigee">
              <Icon name="git-compare" size={14} />
            </button>
            <button className="btn" onClick={() => setShowSaveAsTemplate(true)}>
              <Icon name="layout-template" size={14} /> Save as Template
            </button>
            <ExportMenu />
            <button className="btn btn-primary" onClick={saveProxy} disabled={!dirty || saving} title="Save (Ctrl+S)">
              {saving ? <span className="spinner" /> : <Icon name="save" size={14} />}
              Save
            </button>
          </div>
        </div>

        <TabBar activeKey={activeTab}>
          {TABS.map((t) => (
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
              {t.key === 'proxyEndpoint' && <span className="tab-count">{proxy.flows.length}</span>}
              {t.key === 'targetEndpoint' && <span className="tab-count">{proxy.targets.length}</span>}
              {t.key === 'policies' && <span className="tab-count">{proxy.policies.length}</span>}
              {t.key === 'resources' && proxy.resources.length > 0 && <span className="tab-count">{proxy.resources.length}</span>}
              {t.key === 'tests' && proxy.tests.length > 0 && <span className="tab-count">{proxy.tests.length}</span>}
              {t.key === 'lint' && lintResult?.ok && (
                <span
                  className="tab-count"
                  style={
                    lintResult.errorCount > 0
                      ? { color: 'var(--error)', background: 'rgba(242, 85, 92, 0.15)' }
                      : lintResult.warningCount > 0
                      ? { color: 'var(--warning)', background: 'rgba(255, 180, 84, 0.15)' }
                      : { color: 'var(--success)', background: 'rgba(47, 212, 143, 0.15)' }
                  }
                >
                  {lintResult.errorCount > 0 ? lintResult.errorCount : lintResult.warningCount > 0 ? lintResult.warningCount : '✓'}
                </span>
              )}
            </button>
          ))}
        </TabBar>
      </div>

      <div className="tab-panel">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'proxyEndpoint' && <ProxyEndpointTab />}
        {activeTab === 'targetEndpoint' && <TargetEndpointTab />}
        {activeTab === 'flowDiagram' && <FlowDiagramTab />}
        {activeTab === 'policies' && <PoliciesTab />}
        {activeTab === 'resources' && <ResourcesTab />}
        {activeTab === 'tests' && <TestsTab />}
        {activeTab === 'lint' && <LintTab />}
        {activeTab === 'preview' && <PreviewTab />}
      </div>

      {showSaveAsTemplate && <SaveAsTemplateModal onClose={() => setShowSaveAsTemplate(false)} />}
      {showHistory && <HistoryModal onClose={() => setShowHistory(false)} />}
      {showDriftCompare && <DriftCompareModal onClose={() => setShowDriftCompare(false)} currentProxy={proxy} />}
    </>
  );
}
