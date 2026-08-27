import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { useSharedFlowStore } from '../store/useSharedFlowStore';
import { useUiStore } from '../store/useUiStore';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { Icon } from './Icon';
import { NewProxyModal } from './NewProxyModal';
import { NewSharedFlowModal } from './NewSharedFlowModal';
import { UseTemplateModal } from './UseTemplateModal';
import { ImportProxyModal } from './ImportProxyModal';
import { ConfirmModal } from './ConfirmModal';
import { clickableRowProps } from '../lib/a11y';
import type { Template } from '../types/proxy';

export function Sidebar() {
  const proxies = useStore((s) => s.proxies);
  const templates = useStore((s) => s.templates);
  const currentProxy = useStore((s) => s.currentProxy);
  const openProxy = useStore((s) => s.openProxy);
  const deleteProxy = useStore((s) => s.deleteProxy);
  const duplicateProxy = useStore((s) => s.duplicateProxy);
  const importProxy = useStore((s) => s.importProxy);
  const deleteTemplateAction = useStore((s) => s.refreshTemplates);
  const closeProxy = useStore((s) => s.closeProxy);

  const sharedFlows = useSharedFlowStore((s) => s.sharedFlows);
  const currentSharedFlow = useSharedFlowStore((s) => s.currentSharedFlow);
  const openSharedFlow = useSharedFlowStore((s) => s.openSharedFlow);
  const importSharedFlow = useSharedFlowStore((s) => s.importSharedFlow);
  const deleteSharedFlow = useSharedFlowStore((s) => s.deleteSharedFlow);
  const duplicateSharedFlow = useSharedFlowStore((s) => s.duplicateSharedFlow);
  const closeSharedFlow = useSharedFlowStore((s) => s.closeSharedFlow);

  const openCommandPalette = useUiStore((s) => s.openCommandPalette);
  const workspaceOpen = useWorkspaceStore((s) => s.open);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const closeWorkspace = useWorkspaceStore((s) => s.closeWorkspace);

  const [query, setQuery] = useState('');
  const [showNewProxy, setShowNewProxy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNewSharedFlow, setShowNewSharedFlow] = useState(false);
  const [templateToUse, setTemplateToUse] = useState<Template | null>(null);
  const [proxyToDelete, setProxyToDelete] = useState<{ id: string; name: string } | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [sharedFlowToDelete, setSharedFlowToDelete] = useState<{ id: string; name: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importSharedFlowInputRef = useRef<HTMLInputElement>(null);

  const filteredProxies = useMemo(
    () => proxies.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [proxies, query]
  );

  const removeTemplate = async (id: string) => {
    const { api } = await import('../api/client');
    await api.deleteTemplate(id);
    await deleteTemplateAction();
  };

  const handleOpenProxy = (id: string) => {
    closeWorkspace();
    closeSharedFlow();
    openProxy(id);
  };

  const handleOpenSharedFlow = (id: string) => {
    closeWorkspace();
    closeProxy();
    openSharedFlow(id);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    closeWorkspace();
    closeSharedFlow();
    importProxy(file);
  };

  const handleImportSharedFlowFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    closeWorkspace();
    closeProxy();
    importSharedFlow(file);
  };

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Icon name="puzzle" size={18} color="#06120e" />
        </div>
        <div className="brand-text">
          <h1>Apigee Proxy Studio</h1>
          <span>Build. Bundle. Import.</span>
        </div>
        {/* The palette is keyboard-first, so it needs somewhere visible to be
            discovered from. The search box below is a different thing — it
            filters this list in place. */}
        <button
          className="brand-cmdk"
          onClick={openCommandPalette}
          aria-label="Open command palette"
          title="Command palette (Ctrl+K)"
        >
          <Icon name="command" size={12} />K
        </button>
      </div>

      <div className="search-box">
        <Icon name="search" size={14} />
        <input placeholder="Search proxies…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="sidebar-scroll">
        {/* Above the lists on purpose: this is the only view that's about all
            of them at once, so it doesn't belong inside any one section. */}
        <div className="sidebar-section">
          <div
            className={`nav-item ${workspaceOpen ? 'active' : ''}`}
            aria-current={workspaceOpen || undefined}
            {...clickableRowProps(() => (workspaceOpen ? closeWorkspace() : openWorkspace()))}
          >
            <div className="nav-item-icon">
              <Icon name="radar" size={14} />
            </div>
            <div className="nav-item-body">
              <div className="nav-item-title">Workspace Audit</div>
              <div className="nav-item-sub">Base paths, backends, shared flow usage, house rules</div>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span className="sidebar-section-title">Proxies ({proxies.length})</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <input
                ref={importInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
              <button
                className="icon-btn"
                onClick={() => setShowImport(true)}
                aria-label="Import a proxy"
                title="Import from a .zip bundle, an OpenAPI/Swagger spec, or a curl command"
              >
                <Icon name="upload" size={14} />
              </button>
              <button className="icon-btn" onClick={() => setShowNewProxy(true)} aria-label="New proxy">
                <Icon name="plus" size={15} />
              </button>
            </div>
          </div>

          {filteredProxies.length === 0 && (
            <div className="empty-hint">
              {proxies.length === 0
                ? 'No proxies yet — create one or start from a template below.'
                : 'No proxies match your search.'}
            </div>
          )}

          {filteredProxies.map((p) => (
            <div
              key={p.id}
              className={`nav-item ${currentProxy?.id === p.id ? 'active' : ''}`}
              aria-current={currentProxy?.id === p.id || undefined}
              {...clickableRowProps(() => handleOpenProxy(p.id))}
            >
              <div className="nav-item-icon">
                <Icon name="waypoints" size={14} />
              </div>
              <div className="nav-item-body">
                <div className="nav-item-title">{p.name}</div>
                <div className="nav-item-sub">
                  {p.basePath} &middot; {p.policyCount} polic{p.policyCount === 1 ? 'y' : 'ies'}
                </div>
              </div>
              <div className="nav-item-actions" style={{ display: 'flex', gap: 2 }}>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateProxy(p.id);
                  }}
                  aria-label="Duplicate proxy"
                  title="Duplicate"
                >
                  <Icon name="copy" size={13} />
                </button>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProxyToDelete({ id: p.id, name: p.name });
                  }}
                  aria-label="Delete proxy"
                >
                  <Icon name="trash-2" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span className="sidebar-section-title">Shared Flows ({sharedFlows.length})</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <input
                ref={importSharedFlowInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={handleImportSharedFlowFile}
              />
              <button
                className="icon-btn"
                onClick={() => importSharedFlowInputRef.current?.click()}
                aria-label="Import a shared flow"
                title="Import from a sharedflowbundle .zip"
              >
                <Icon name="upload" size={14} />
              </button>
              <button className="icon-btn" onClick={() => setShowNewSharedFlow(true)} aria-label="New shared flow">
                <Icon name="plus" size={15} />
              </button>
            </div>
          </div>

          {sharedFlows.length === 0 && (
            <div className="empty-hint">
              Reusable policy bundles invoked via FlowCallout — e.g. shared OAuth or error handling.
            </div>
          )}

          {sharedFlows.map((sf) => (
            <div
              key={sf.id}
              className={`nav-item ${currentSharedFlow?.id === sf.id ? 'active' : ''}`}
              aria-current={currentSharedFlow?.id === sf.id || undefined}
              {...clickableRowProps(() => handleOpenSharedFlow(sf.id))}
            >
              <div className="nav-item-icon">
                <Icon name="git-branch" size={14} />
              </div>
              <div className="nav-item-body">
                <div className="nav-item-title">{sf.name}</div>
                <div className="nav-item-sub">
                  {sf.stepCount} step{sf.stepCount === 1 ? '' : 's'} &middot; {sf.policyCount} polic
                  {sf.policyCount === 1 ? 'y' : 'ies'}
                </div>
              </div>
              <div className="nav-item-actions" style={{ display: 'flex', gap: 2 }}>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicateSharedFlow(sf.id);
                  }}
                  aria-label="Duplicate shared flow"
                  title="Duplicate"
                >
                  <Icon name="copy" size={13} />
                </button>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSharedFlowToDelete({ id: sf.id, name: sf.name });
                  }}
                  aria-label="Delete shared flow"
                >
                  <Icon name="trash-2" size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span className="sidebar-section-title">Templates ({templates.length})</span>
          </div>
          {templates.map((t) => (
            <div key={t.id} className="nav-item" {...clickableRowProps(() => setTemplateToUse(t))}>
              <div className="nav-item-icon">
                <Icon name="layout-template" size={14} />
              </div>
              <div className="nav-item-body">
                <div className="nav-item-title">{t.name}</div>
                <div className="nav-item-sub">{t.description}</div>
              </div>
              <div className="nav-item-actions" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {t.builtIn ? (
                  <span className="template-badge">Built-in</span>
                ) : (
                  <button
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTemplateToDelete(t);
                    }}
                    aria-label="Delete template"
                  >
                    <Icon name="trash-2" size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showNewProxy && <NewProxyModal onClose={() => setShowNewProxy(false)} />}
      {showImport && (
        <ImportProxyModal
          onClose={() => setShowImport(false)}
          onPickZip={() => importInputRef.current?.click()}
        />
      )}
      {showNewSharedFlow && <NewSharedFlowModal onClose={() => setShowNewSharedFlow(false)} />}
      {templateToUse && <UseTemplateModal template={templateToUse} onClose={() => setTemplateToUse(null)} />}
      {proxyToDelete && (
        <ConfirmModal
          title="Delete proxy?"
          message={`"${proxyToDelete.name}" will be permanently removed from this local workspace. This can't be undone.`}
          onConfirm={() => deleteProxy(proxyToDelete.id)}
          onClose={() => setProxyToDelete(null)}
        />
      )}
      {sharedFlowToDelete && (
        <ConfirmModal
          title="Delete shared flow?"
          message={`"${sharedFlowToDelete.name}" will be permanently removed. Any FlowCallout policies referencing it will need to be updated.`}
          onConfirm={() => deleteSharedFlow(sharedFlowToDelete.id)}
          onClose={() => setSharedFlowToDelete(null)}
        />
      )}
      {templateToDelete && (
        <ConfirmModal
          title="Delete template?"
          message={`"${templateToDelete.name}" will be permanently removed. Proxies already created from it are unaffected.`}
          onConfirm={() => removeTemplate(templateToDelete.id)}
          onClose={() => setTemplateToDelete(null)}
        />
      )}
    </div>
  );
}
