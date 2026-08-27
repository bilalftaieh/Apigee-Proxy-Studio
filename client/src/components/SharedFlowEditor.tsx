import { useSharedFlowStore, type SharedFlowTabKey } from '../store/useSharedFlowStore';
import { Icon } from './Icon';
import { TabBar } from './TabBar';
import { SharedFlowStepsPanel } from './sharedFlowTabs/SharedFlowStepsPanel';
import { SharedFlowPoliciesPanel } from './sharedFlowTabs/SharedFlowPoliciesPanel';
import { SharedFlowResourcesPanel } from './sharedFlowTabs/SharedFlowResourcesPanel';
import { SharedFlowLintPanel } from './sharedFlowTabs/SharedFlowLintPanel';
import { SharedFlowPreviewPanel } from './sharedFlowTabs/SharedFlowPreviewPanel';

const TABS: { key: SharedFlowTabKey; label: string; icon: string }[] = [
  { key: 'steps', label: 'Steps', icon: 'list-ordered' },
  { key: 'policies', label: 'Policies', icon: 'shield' },
  { key: 'resources', label: 'Resources', icon: 'folder-code' },
  { key: 'lint', label: 'Lint', icon: 'scan-line' },
  { key: 'preview', label: 'XML Preview', icon: 'file-code' },
];

export function SharedFlowEditor() {
  const sharedFlow = useSharedFlowStore((s) => s.currentSharedFlow)!;
  const dirty = useSharedFlowStore((s) => s.dirty);
  const saving = useSharedFlowStore((s) => s.saving);
  const linting = useSharedFlowStore((s) => s.linting);
  const lintResult = useSharedFlowStore((s) => s.lintResult);
  const activeTab = useSharedFlowStore((s) => s.activeTab);
  const setActiveTab = useSharedFlowStore((s) => s.setActiveTab);
  const saveSharedFlow = useSharedFlowStore((s) => s.saveSharedFlow);
  const exportSharedFlow = useSharedFlowStore((s) => s.exportSharedFlow);
  const patchSharedFlow = useSharedFlowStore((s) => s.patchSharedFlow);
  const undo = useSharedFlowStore((s) => s.undo);
  const redo = useSharedFlowStore((s) => s.redo);
  const undoDepth = useSharedFlowStore((s) => s.undoDepth);
  const redoDepth = useSharedFlowStore((s) => s.redoDepth);

  return (
    <>
      <div className="proxy-header">
        <div className="proxy-header-top">
          <div>
            <div className="proxy-title-row">
              <h2 className="proxy-title">{sharedFlow.name}</h2>
              <span className="proxy-basepath">
                <Icon name="git-branch" size={11} /> Shared Flow
              </span>
              {dirty && <span className="dirty-dot" title="Unsaved changes" />}
            </div>
            <input
              className="proxy-desc"
              style={{
                background: 'transparent',
                border: 'none',
                width: '100%',
                maxWidth: 480,
                padding: 0,
                marginTop: 4,
                fontSize: 13,
              }}
              placeholder="Add a description…"
              value={sharedFlow.description}
              onChange={(e) => patchSharedFlow({ description: e.target.value })}
            />
          </div>
          <div className="header-actions">
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
            <button className="btn" onClick={exportSharedFlow} disabled={linting} title="Runs apigeelint first — blocked if it finds errors">
              {linting ? <span className="spinner" /> : <Icon name="download" size={14} />}
              {linting ? 'Linting…' : 'Export ZIP'}
            </button>
            <button className="btn btn-primary" onClick={saveSharedFlow} disabled={!dirty || saving} title="Save (Ctrl+S)">
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
              {t.key === 'steps' && <span className="tab-count">{sharedFlow.steps.length}</span>}
              {t.key === 'policies' && <span className="tab-count">{sharedFlow.policies.length}</span>}
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
        {activeTab === 'steps' && <SharedFlowStepsPanel />}
        {activeTab === 'policies' && <SharedFlowPoliciesPanel />}
        {activeTab === 'resources' && <SharedFlowResourcesPanel />}
        {activeTab === 'lint' && <SharedFlowLintPanel />}
        {activeTab === 'preview' && <SharedFlowPreviewPanel />}
      </div>
    </>
  );
}
