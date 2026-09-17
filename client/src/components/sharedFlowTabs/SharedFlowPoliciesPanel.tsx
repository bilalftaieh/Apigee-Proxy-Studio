import { useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useStore } from '../../store/useStore';
import { useSharedFlowStore } from '../../store/useSharedFlowStore';
import { Icon } from '../Icon';
import { policyCategory, policyAbbr } from '../../lib/policyCategory';
import { AddPolicyModal } from '../AddPolicyModal';
import { ConfirmModal } from '../ConfirmModal';
import { FlowCalloutHelper } from '../FlowCalloutHelper';
import { setupApigeeMonaco } from '../../lib/monacoApigee';
import { EDITOR_OPTIONS, attachLayoutFallback } from '../../lib/monacoLayout';
import { policyReferencesResource, resourceUri } from '../../lib/resourceTypes';
import { buildSharedFlowAttachments } from '../../lib/policyAttachment';


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

  /**
   * Which step each policy sits at, and which sit at none. A shared flow's step
   * list is flat, so there are no buckets to group by the way the proxy panel
   * has — but "in the bundle, in no step, never runs" applies here exactly as
   * it does there, and was just as invisible.
   */
  const stepPositions = useMemo(() => buildSharedFlowAttachments(sharedFlow), [sharedFlow]);

  // Sorted by first step, not by when the policy was created: the group is
  // labelled "Step list", so listing it in any other order makes the label a
  // lie and the step numbers look scrambled.
  const attached = useMemo(
    () =>
      sharedFlow.policies
        .filter((p) => (stepPositions.get(p.name)?.length ?? 0) > 0)
        .sort((a, b) => (stepPositions.get(a.name)![0] ?? 0) - (stepPositions.get(b.name)![0] ?? 0)),
    [sharedFlow.policies, stepPositions]
  );
  const unattached = useMemo(
    () => sharedFlow.policies.filter((p) => (stepPositions.get(p.name)?.length ?? 0) === 0),
    [sharedFlow.policies, stepPositions]
  );

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
      {/* .policy-list-col, not a bare div: the column has to be a flex column
          with min-height 0 for .policy-list's own `flex:1; overflow-y:auto` to
          resolve against it. Without it the list never scrolled — it grew and
          pushed the column past the panel. */}
      <div className="policy-list-col">
        <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 12, flexShrink: 0 }} onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={13} /> Add Policy
        </button>
        {/* A count, not a control — those policies are in the list below, in
            their own group. Matches the proxy editor's Policies tab. */}
        {unattached.length > 0 && (
          <div className="policy-unattached-hint">
            <Icon name="alert-triangle" size={12} />
            <span>
              {unattached.length} polic{unattached.length === 1 ? 'y' : 'ies'} in no step — shipped, never run. Add
              {unattached.length === 1 ? ' it' : ' them'} on the Steps tab.
            </span>
          </div>
        )}

        <div className="policy-list">
          {[
            { group: 'sharedflow-steps' as const, label: 'Step list', policies: attached },
            { group: 'unattached' as const, label: 'Not attached', policies: unattached },
          ]
            .filter((bucket) => bucket.policies.length > 0)
            .map((bucket) => (
              <div key={bucket.group} className="policy-group" data-group={bucket.group}>
                <div className="policy-group-head">
                  <span className="policy-group-title">{bucket.label}</span>
                  <span className="policy-group-count">{bucket.policies.length}</span>
                </div>
                {bucket.policies.map((p) => {
                  const type = policyTypes.find((t) => t.key === p.type);
                  const positions = stepPositions.get(p.name) ?? [];
                  return (
                    <div
                      key={p.id}
                      className={`policy-list-item ${selected?.id === p.id ? 'active' : ''}`}
                      data-cat={policyCategory(p.type, type?.category)}
                      onClick={() => setSelectedPolicyId(p.id)}
                    >
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
                          {positions.length > 0 && (
                            <>
                              {' · '}
                              <span
                                className="policy-list-item-site"
                                title={
                                  positions.length > 1
                                    ? `Runs at steps ${positions.join(', ')}`
                                    : `Runs at step ${positions[0]}`
                                }
                              >
                                Step {positions.join(', ')}
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
                onMount={(editorInstance) => attachLayoutFallback(editorInstance)}
                value={selected.xml}
                onChange={(value) => updatePolicyXml(selected.id, value || '')}
                options={EDITOR_OPTIONS}
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
