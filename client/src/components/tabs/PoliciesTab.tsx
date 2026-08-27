import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNs } from 'monaco-editor';
import { useStore } from '../../store/useStore';
import { Icon } from '../Icon';
import { AddPolicyModal } from '../AddPolicyModal';
import { ConfirmModal } from '../ConfirmModal';
import { FlowCalloutHelper } from '../FlowCalloutHelper';
import { PolicyVisualEditor } from '../PolicyVisualEditor';
import { setupApigeeMonaco } from '../../lib/monacoApigee';
import { getPolicySchema } from '../../lib/policySchema';
import { lintPolicyXml } from '../../lib/fastLint';
import { policyReferencesResource, resourceUri } from '../../lib/resourceTypes';

export function PoliciesTab() {
  const proxy = useStore((s) => s.currentProxy)!;
  const policyTypes = useStore((s) => s.policyTypes);
  const selectedPolicyId = useStore((s) => s.selectedPolicyId);
  const setSelectedPolicyId = useStore((s) => s.setSelectedPolicyId);
  const addPolicy = useStore((s) => s.addPolicy);
  const updatePolicyXml = useStore((s) => s.updatePolicyXml);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setSelectedResourceId = useStore((s) => s.setSelectedResourceId);
  const renamePolicy = useStore((s) => s.renamePolicy);
  const removePolicy = useStore((s) => s.removePolicy);
  const duplicatePolicy = useStore((s) => s.duplicatePolicy);

  const [showAdd, setShowAdd] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editorView, setEditorView] = useState<'visual' | 'xml'>('xml');

  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const selected = proxy.policies.find((p) => p.id === selectedPolicyId) || proxy.policies[0];
  const schema = selected ? getPolicySchema(selected.type) : undefined;

  useEffect(() => {
    setEditorView(selected && getPolicySchema(selected.type) ? 'visual' : 'xml');
  }, [selected?.id]);

  // Files this policy references. Editing them happens on the Resources tab —
  // this is a jump link, not a second editor: one file can be referenced by
  // several policies, so a per-policy copy of the editor would be showing the
  // same file in several places with no indication they're the same one.
  const referenced = useMemo(
    () => (selected ? proxy.resources.filter((r) => policyReferencesResource(selected.xml, r.path)) : []),
    [selected?.xml, proxy.resources]
  );

  // Fast, in-process structural checks — no apigeelint subprocess, safe on every keystroke.
  // The full apigeelint pass (Lint tab / export gate) is unaffected and still authoritative.
  const fastLintIssues = useMemo(
    () => (selected ? lintPolicyXml(selected.xml, selected.name) : []),
    [selected?.xml, selected?.name]
  );

  const handleXmlEditorMount: OnMount = (editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
  };

  // The raw XML Monaco editor unmounts (and disposes) whenever the Visual or
  // Resource view is active — drop the stale refs so the marker effect below
  // doesn't touch a disposed editor.
  useEffect(() => {
    if (editorView !== 'xml') {
      editorRef.current = null;
      monacoRef.current = null;
    }
  }, [editorView, selected?.id]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    const monaco = monacoRef.current;
    if (!model || !monaco) return;
    const markers: MonacoEditorNs.IMarkerData[] = fastLintIssues.map((issue) => {
      const start = model.getPositionAt(issue.startIndex);
      const end = model.getPositionAt(issue.endIndex);
      return {
        severity: issue.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
        message: issue.message,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: Math.max(end.column, start.column + 1),
      };
    });
    monaco.editor.setModelMarkers(model, 'fast-lint', markers);
  }, [fastLintIssues]);

  if (!proxy.policies.length) {
    return (
      <>
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <Icon name="shield" size={26} color="var(--text-3)" />
          <h4 style={{ margin: '14px 0 6px' }}>No policies yet</h4>
          <p className="card-subtitle" style={{ margin: '0 0 18px' }}>
            Policies implement security, traffic management and mediation logic. Attach one to get started.
          </p>
          <button className="btn btn-primary" style={{ margin: '0 auto' }} onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={14} /> Add Policy
          </button>
        </div>
        {showAdd && <AddPolicyModal onClose={() => setShowAdd(false)} policies={proxy.policies} resources={proxy.resources} onAdd={addPolicy} allowChains />}
      </>
    );
  }

  return (
    <div className="policies-layout">
      <div className="policy-list-col">
        <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 12, flexShrink: 0 }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={13} /> Add Policy
        </button>
        <div className="policy-list">
          {proxy.policies.map((p) => {
            const type = policyTypes.find((t) => t.key === p.type);
            return (
              <div
                key={p.id}
                className={`policy-list-item ${selected?.id === p.id ? 'active' : ''}`}
                onClick={() => setSelectedPolicyId(p.id)}
              >
                <span className="policy-dot" style={{ background: type?.accent || '#8b93a7' }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="policy-list-item-name mono">{p.name}</div>
                  <div className="policy-list-item-type">{type?.label || p.type}</div>
                </div>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicatePolicy(p.id);
                  }}
                  aria-label="Duplicate policy"
                  title="Duplicate"
                >
                  <Icon name="copy" size={13} />
                </button>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete({ id: p.id, name: p.name });
                  }}
                  aria-label="Delete policy"
                >
                  <Icon name="trash-2" size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="policy-editor">
          <div className="policy-editor-head">
            <input className="mono" value={selected.name} onChange={(e) => renamePolicy(selected.id, e.target.value)} />
            <div className="mode-toggle" style={{ flexShrink: 0 }}>
              {schema && (
                <button type="button" className={editorView === 'visual' ? 'active' : ''} onClick={() => setEditorView('visual')}>
                  <Icon name="sliders-horizontal" size={12} /> Visual
                </button>
              )}
              <button type="button" className={editorView === 'xml' ? 'active' : ''} onClick={() => setEditorView('xml')}>
                XML
              </button>
            </div>
            <span className="template-badge" style={{ flexShrink: 0 }}>
              {policyTypes.find((t) => t.key === selected.type)?.label || selected.type}
            </span>
          </div>
          {selected.type === 'FlowCallout' && editorView === 'xml' && (
            <FlowCalloutHelper xml={selected.xml} onInsert={(xml) => updatePolicyXml(selected.id, xml)} />
          )}
          {referenced.length > 0 && (
            <div className="entity-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Icon name="folder-code" size={13} color="var(--text-3)" />
              <span className="field-hint" style={{ flexShrink: 0 }}>
                Runs
              </span>
              {referenced.map((r) => (
                <button
                  key={r.id}
                  className="btn btn-sm btn-ghost mono"
                  style={{ fontSize: 11.5 }}
                  title={`Edit ${r.path} on the Resources tab`}
                  onClick={() => {
                    setSelectedResourceId(r.id);
                    setActiveTab('resources');
                  }}
                >
                  {resourceUri(r.path)}
                </button>
              ))}
            </div>
          )}
          {fastLintIssues.length > 0 && (
            <div className="fast-lint-panel">
              {fastLintIssues.map((issue) => (
                <div className="entity-row fast-lint-item" key={issue.ruleId} data-severity={issue.severity}>
                  <Icon name={issue.severity === 'warning' ? 'alert-triangle' : 'info'} size={13} />
                  <span style={{ flex: 1, fontSize: 12 }}>{issue.message}</span>
                  {issue.quickFix && (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ flexShrink: 0 }}
                      onClick={() => updatePolicyXml(selected.id, issue.quickFix!.apply(selected.xml))}
                    >
                      {issue.quickFix.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {editorView === 'visual' && schema ? (
            <div className="pf-editor-wrap">
              <PolicyVisualEditor key={selected.id} xml={selected.xml} schema={schema} policyName={selected.name} onChange={(xml) => updatePolicyXml(selected.id, xml)} />
            </div>
          ) : (
            <div className="monaco-wrap">
                <Editor
                  key={selected.id}
                  defaultLanguage="xml"
                  theme="apigee-dark"
                  beforeMount={setupApigeeMonaco}
                  value={selected.xml}
                  onChange={(value) => updatePolicyXml(selected.id, value || '')}
                  onMount={handleXmlEditorMount}
                  options={{
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 14 },
                    renderLineHighlight: 'none',
                  }}
                />
            </div>
          )}
        </div>
      )}

      {showAdd && <AddPolicyModal onClose={() => setShowAdd(false)} policies={proxy.policies} resources={proxy.resources} onAdd={addPolicy} allowChains />}
      {toDelete && (
        <ConfirmModal
          title="Delete policy?"
          message={`"${toDelete.name}" will be removed from the policy list and from every flow step that references it.`}
          onConfirm={() => removePolicy(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
