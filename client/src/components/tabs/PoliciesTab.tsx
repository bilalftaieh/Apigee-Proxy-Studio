import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditorNs } from 'monaco-editor';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import { Icon } from '../Icon';
import { AddPolicyModal } from '../AddPolicyModal';
import { AiPolicyModal } from '../AiPolicyModal';
import { ConfirmModal } from '../ConfirmModal';
import { FlowCalloutHelper } from '../FlowCalloutHelper';
import { PolicyVisualEditor } from '../PolicyVisualEditor';
import { setupApigeeMonaco } from '../../lib/monacoApigee';
import { getPolicySchema } from '../../lib/policySchema';
import { lintPolicyXml } from '../../lib/fastLint';
import { EDITOR_OPTIONS, attachLayoutFallback } from '../../lib/monacoLayout';
import { policyReferencesResource, resourceUri } from '../../lib/resourceTypes';
import { buildPolicyAttachments, GROUP_LABELS, GROUP_ORDER, type AttachmentGroup } from '../../lib/policyAttachment';
import { policyCategory, policyAbbr } from '../../lib/policyCategory';

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
  const [showAi, setShowAi] = useState(false);
  // Null until the status call lands, so the button doesn't flicker in and then
  // out again on a workspace where AI isn't configured.
  const [aiReady, setAiReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (proxy.aiDisabled) {
      setAiReady(false);
      return;
    }
    let cancelled = false;
    api
      .aiStatus()
      .then((s) => !cancelled && setAiReady(s.configured))
      .catch(() => !cancelled && setAiReady(false));
    return () => {
      cancelled = true;
    };
  }, [proxy.aiDisabled]);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editorView, setEditorView] = useState<'visual' | 'xml'>('xml');
  const [filter, setFilter] = useState('');

  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const selected = proxy.policies.find((p) => p.id === selectedPolicyId) || proxy.policies[0];
  const schema = selected ? getPolicySchema(selected.type) : undefined;

  // Where each policy is attached — the thing the list used to leave out. See
  // lib/policyAttachment.ts for why it matters.
  const attachments = useMemo(() => buildPolicyAttachments(proxy), [proxy]);

  /**
   * The list, bucketed by attachment and filtered. The filter matches the
   * policy's name, its type label and its category, so the colour of the dot —
   * which encodes category and nothing else says so — is reachable as text.
   */
  const groupedPolicies = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const buckets = new Map<AttachmentGroup, typeof proxy.policies>();

    for (const policy of proxy.policies) {
      const type = policyTypes.find((t) => t.key === policy.type);
      if (needle) {
        const haystack = `${policy.name} ${type?.label ?? policy.type} ${type?.category ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      const group = attachments.get(policy.name)?.group ?? 'unattached';
      const bucket = buckets.get(group);
      if (bucket) bucket.push(policy);
      else buckets.set(group, [policy]);
    }

    return GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({ group: g, policies: buckets.get(g)! }));
  }, [proxy.policies, policyTypes, attachments, filter]);

  const matchCount = groupedPolicies.reduce((n, g) => n + g.policies.length, 0);
  const unattachedCount = proxy.policies.filter((p) => attachments.get(p.name)?.group === 'unattached').length;

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
    // No teardown to track here: the fallback detaches itself when this editor
    // is disposed, which is what @monaco-editor/react does on unmount.
    attachLayoutFallback(editorInstance);
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
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Icon name="plus" size={14} /> Add Policy
            </button>
            {aiReady && (
              <button className="btn btn-ghost" onClick={() => setShowAi(true)}>
                <Icon name="sparkles" size={14} /> Generate with AI
              </button>
            )}
          </div>
        </div>
        {showAdd && <AddPolicyModal onClose={() => setShowAdd(false)} policies={proxy.policies} resources={proxy.resources} onAdd={addPolicy} allowChains />}
        {showAi && <AiPolicyModal onClose={() => setShowAi(false)} />}
      </>
    );
  }

  return (
    <div className="policies-layout">
      <div className="policy-list-col">
        <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: aiReady ? 6 : 12, flexShrink: 0 }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={13} /> Add Policy
        </button>
        {aiReady && (
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginBottom: 12, flexShrink: 0 }} onClick={() => setShowAi(true)}>
            <Icon name="sparkles" size={13} /> Generate with AI
          </button>
        )}
        {/* Worth the row once a proxy has more than a handful of policies —
            the real ones here run to 27, which is a long scroll to eyeball. */}
        {proxy.policies.length > 6 && (
          <div className="policy-filter">
            <Icon name="search" size={13} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter policies…"
              aria-label="Filter policies by name, type or category"
            />
            {filter && (
              <button className="icon-btn" onClick={() => setFilter('')} aria-label="Clear filter" title="Clear">
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        )}

        {/* A count, not a control — the policies it refers to are already in
            the list, in their own group at the bottom. */}
        {unattachedCount > 0 && !filter && (
          <div className="policy-unattached-hint">
            <Icon name="alert-triangle" size={12} />
            <span>
              {unattachedCount} polic{unattachedCount === 1 ? 'y' : 'ies'} attached to no flow — shipped, never run
            </span>
          </div>
        )}

        <div className="policy-list">
          {matchCount === 0 && <div className="empty-hint">No policies match “{filter}”.</div>}
          {groupedPolicies.map(({ group, policies }) => (
            <div key={group} className="policy-group" data-group={group}>
              <div className="policy-group-head">
                <span className="policy-group-title">{GROUP_LABELS[group]}</span>
                <span className="policy-group-count">{policies.length}</span>
              </div>
              {policies.map((p) => {
                const type = policyTypes.find((t) => t.key === p.type);
                const attachment = attachments.get(p.name);
                const sites = attachment?.sites ?? [];
                return (
                  <div
                    key={p.id}
                    className={`policy-list-item ${selected?.id === p.id ? 'active' : ''}`}
                    data-cat={policyCategory(p.type, type?.category)}
                    onClick={() => setSelectedPolicyId(p.id)}
                  >
                    {/* Colour carries the policy family and nothing else, so a
                        glance down the list says what kind of work happens
                        where. The two letters are the same prefix the studio
                        generates names from, so the chip and the name agree —
                        and they, not the colour, are what actually names the
                        category for anyone who can't separate the hues. */}
                    <span
                      className="policy-cat"
                      data-cat={policyCategory(p.type, type?.category)}
                      title={type?.category ? `${type.category} policy` : undefined}
                    >
                      {policyAbbr(p.type)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="policy-list-item-name mono">{p.name}</div>
                      <div className="policy-list-item-type">
                        {type?.label || p.type}
                        {sites.length > 0 && (
                          <>
                            {' · '}
                            <span className="policy-list-item-site" title={sites.map((site) => site.where).join(', ')}>
                              {sites[0].where}
                              {sites.length > 1 && ` +${sites.length - 1}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      className="icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicatePolicy(p.id);
                      }}
                      aria-label={`Duplicate policy ${p.name}`}
                      title="Duplicate"
                    >
                      <Icon name="copy" size={13} />
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete({ id: p.id, name: p.name });
                      }}
                      aria-label={`Delete policy ${p.name}`}
                      title="Delete"
                    >
                      <Icon name="trash-2" size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
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
                  options={EDITOR_OPTIONS}
                />
            </div>
          )}
        </div>
      )}

      {showAdd && <AddPolicyModal onClose={() => setShowAdd(false)} policies={proxy.policies} resources={proxy.resources} onAdd={addPolicy} allowChains />}
      {showAi && <AiPolicyModal onClose={() => setShowAi(false)} />}
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
