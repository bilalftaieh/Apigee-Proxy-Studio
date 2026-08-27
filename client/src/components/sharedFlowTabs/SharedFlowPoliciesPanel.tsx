import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../../store/useStore';
import { useSharedFlowStore } from '../../store/useSharedFlowStore';
import { Icon } from '../Icon';
import { AddPolicyModal } from '../AddPolicyModal';
import { ConfirmModal } from '../ConfirmModal';
import { FlowCalloutHelper } from '../FlowCalloutHelper';
import { setupApigeeMonaco } from '../../lib/monacoApigee';
import { policyReferencesResource, resourceUri } from '../../lib/resourceTypes';


export function SharedFlowPoliciesPanel() {
  const sharedFlow = useSharedFlowStore((s) => s.currentSharedFlow)!;
  const policyTypes = useStore((s) => s.policyTypes);
  const selectedPolicyId = useSharedFlowStore((s) => s.selectedPolicyId);
  const setSelectedPolicyId = useSharedFlowStore((s) => s.setSelectedPolicyId);
  const addPolicy = useSharedFlowStore((s) => s.addPolicy);
  const updatePolicyXml = useSharedFlowStore((s) => s.updatePolicyXml);
  const setActiveTab = useSharedFlowStore((s) => s.setActiveTab);
  const setSelectedResourceId = useSharedFlowStore((s) => s.setSelectedResourceId);
  const renamePolicy = useSharedFlowStore((s) => s.renamePolicy);
  const removePolicy = useSharedFlowStore((s) => s.removePolicy);
  const duplicatePolicy = useSharedFlowStore((s) => s.duplicatePolicy);

  const [showAdd, setShowAdd] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const selected = sharedFlow.policies.find((p) => p.id === selectedPolicyId) || sharedFlow.policies[0];

  // Files this policy references — edited on the Resources tab, jumped to from
  // here. See the same comment in PoliciesTab.
  const referenced = useMemo(
    () => (selected ? sharedFlow.resources.filter((r) => policyReferencesResource(selected.xml, r.path)) : []),
    [selected?.xml, sharedFlow.resources]
  );

  if (!sharedFlow.policies.length) {
    return (
      <>
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <Icon name="shield" size={26} color="var(--text-3)" />
          <h4 style={{ margin: '14px 0 6px' }}>No policies yet</h4>
          <p className="card-subtitle" style={{ margin: '0 0 18px' }}>
            Attach a policy, then add it to the step list on the Steps tab.
          </p>
          <button className="btn btn-primary" style={{ margin: '0 auto' }} onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={14} /> Add Policy
          </button>
        </div>
        {showAdd && <AddPolicyModal onClose={() => setShowAdd(false)} policies={sharedFlow.policies} resources={sharedFlow.resources} onAdd={addPolicy} />}
      </>
    );
  }

    return (
    <div className="policies-layout">
      <div>
        <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 12 }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={13} /> Add Policy
        </button>
        <div className="policy-list">
          {sharedFlow.policies.map((p) => {
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
            <span className="template-badge" style={{ flexShrink: 0 }}>
              {policyTypes.find((t) => t.key === selected.type)?.label || selected.type}
            </span>
          </div>
          {selected.type === 'FlowCallout' && (
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
          <div className="monaco-wrap">
              <Editor
                key={selected.id}
                defaultLanguage="xml"
                theme="apigee-dark"
                beforeMount={setupApigeeMonaco}
                value={selected.xml}
                onChange={(value) => updatePolicyXml(selected.id, value || '')}
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
        </div>
      )}

      {showAdd && <AddPolicyModal onClose={() => setShowAdd(false)} policies={sharedFlow.policies} resources={sharedFlow.resources} onAdd={addPolicy} />}
      {toDelete && (
        <ConfirmModal
          title="Delete policy?"
          message={`"${toDelete.name}" will be removed from the policy list and from the step list.`}
          onConfirm={() => removePolicy(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
