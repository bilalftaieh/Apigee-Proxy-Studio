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

/**
 * Nine destinations in one undifferentiated row, mixing two different jobs:
 * authoring the bundle, and checking what the bundle does. Apigee's own console
 * draws the same line between Develop and Trace/Debug, so the row does too —
 * one flat tablist still, just segmented, so nothing moved behind a click.
 *
 * Tab order within each group follows the request's own path: endpoint in,
 * target out, then the policies and files attached along the way.
 */
const TAB_GROUPS: { group: string; tabs: { key: TabKey; label: string; icon: string }[] }[] = [
  {
    group: 'Design',
    tabs: [
      { key: 'overview', label: 'Overview', icon: 'layout-dashboard' },
      { key: 'proxyEndpoint', label: 'Proxy Endpoint', icon: 'signpost' },
      { key: 'targetEndpoint', label: 'Target Endpoint', icon: 'server' },
      { key: 'policies', label: 'Policies', icon: 'shield' },
      { key: 'resources', label: 'Resources', icon: 'folder-code' },
    ],
  },
  {
    group: 'Verify',
    tabs: [
      { key: 'flowDiagram', label: 'Flow Diagram', icon: 'workflow' },
      { key: 'tests', label: 'Test', icon: 'flask-conical' },
      { key: 'lint', label: 'Lint', icon: 'scan-line' },
      { key: 'preview', label: 'XML Preview', icon: 'file-code' },
    ],
  },
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
          {/* Needs the class for its own min-width:0 — without it the flex
              parent refuses to shrink this below its longest word and the
              title wraps a character at a time instead of truncating. */}
          <div className="proxy-header-identity">
            <div className="proxy-title-row">
              <h2 className="proxy-title" title={proxy.name}>
                {proxy.name}
              </h2>
              <span className="proxy-basepath">{proxy.basePath}</span>
              {dirty && <span className="dirty-dot" title="Unsaved changes" />}
            </div>
            {/* One line in the header; the title attribute carries the rest,
                and the Overview tab has the field itself. */}
            {proxy.description && (
              <p className="proxy-desc" title={proxy.description}>
                {proxy.description}
              </p>
            )}
          </div>
          <div className="header-actions">
            {proxy.environments.length > 0 && (
              <select
                className="btn btn-select"
                value={selectedEnvironmentId || ''}
                onChange={(e) => setSelectedEnvironmentId(e.target.value || null)}
                aria-label="Environment used for Lint, Preview and Export"
                title="Environment used for Lint/Preview/Export"
              >
                <option value="">Base (no environment)</option>
                {proxy.environments.map((env) => (
                  <option key={env.id} value={env.id}>
                    {env.name}
                  </option>
                ))}
              </select>
            )}

            {/* Undo/redo are the two most-used buttons here and belong to one
                another, so they read as one control rather than as two more
                entries in a row of seven. */}
            <div className="btn-group">
              <button
                className="btn"
                onClick={undo}
                disabled={undoDepth === 0}
                aria-label="Undo"
                title={undoDepth === 0 ? 'Nothing to undo' : `Undo (Ctrl+Z) — ${undoDepth} step${undoDepth === 1 ? '' : 's'}`}
              >
                <Icon name="undo-2" size={14} />
              </button>
              <button
                className="btn"
                onClick={redo}
                disabled={redoDepth === 0}
                aria-label="Redo"
                title={redoDepth === 0 ? 'Nothing to redo' : `Redo (Ctrl+Shift+Z) — ${redoDepth} step${redoDepth === 1 ? '' : 's'}`}
              >
                <Icon name="redo-2" size={14} />
              </button>
            </div>

            {/* Both compare this proxy against another version of itself —
                one against its own past saves, one against a bundle pulled
                from Apigee. Rare, so they sit apart from the frequent pair
                above rather than at the same weight as everything else. */}
            <div className="btn-group">
              <button className="btn" onClick={() => setShowHistory(true)} aria-label="History" title="View and restore past saves">
                <Icon name="history" size={14} />
              </button>
              <button
                className="btn"
                onClick={() => setShowDriftCompare(true)}
                aria-label="Compare with a deployed bundle"
                title="Compare with a bundle downloaded from Apigee"
              >
                <Icon name="git-compare" size={14} />
              </button>
            </div>

            <span className="header-actions-divider" aria-hidden="true" />

            <button className="btn" onClick={() => setShowSaveAsTemplate(true)}>
              <Icon name="layout-template" size={14} /> <span className="btn-label">Save as Template</span>
            </button>
            <ExportMenu />
            <button className="btn btn-primary" onClick={saveProxy} disabled={!dirty || saving} title="Save (Ctrl+S)">
              {saving ? <span className="spinner" /> : <Icon name="save" size={14} />}
              Save
            </button>
          </div>
        </div>

        <TabBar activeKey={activeTab}>
          {TAB_GROUPS.flatMap((g, groupIndex) => [
            <span key={`g-${g.group}`} className="tab-group-label" aria-hidden="true" data-first={groupIndex === 0 || undefined}>
              <span>{g.group}</span>
            </span>,
            ...g.tabs.map((t) => (
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
                      ? { color: 'var(--error-ink)', background: 'var(--error-soft)' }
                      : lintResult.warningCount > 0
                      ? { color: 'var(--warning-ink)', background: 'var(--warning-soft)' }
                      : { color: 'var(--success-ink)', background: 'var(--success-soft)' }
                  }
                >
                  {lintResult.errorCount > 0 ? lintResult.errorCount : lintResult.warningCount > 0 ? lintResult.warningCount : '✓'}
                </span>
              )}
            </button>
            )),
          ])}
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
