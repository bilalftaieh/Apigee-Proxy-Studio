import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Icon } from './Icon';
import { ConfirmModal } from './ConfirmModal';
import { setupApigeeMonaco } from '../lib/monacoApigee';
import { resourceLanguage } from '../lib/resourceLanguage';
import {
  RESOURCE_TYPES,
  basenameOfPath,
  buildResourcePath,
  policyReferencesResource,
  policyTypesForScheme,
  resourceTypeOf,
  resourceUri,
  schemeOfPath,
} from '../lib/resourceTypes';
import type { BundleResource, Policy } from '../types/proxy';

function referencingPolicies(resource: BundleResource, policies: Policy[]): Policy[] {
  return policies.filter((p) => policyReferencesResource(p.xml, resource.path));
}

// Type first, then filename: the resources/<type>/ folder is what decides how
// a policy can reference the file at all, and picking it from the known set
// beats typing a path and finding out at export time that "resources/js/" is
// not a folder Apigee recognizes.
function AddResourceRow({ onAdd }: { onAdd: (path: string, content: string) => void }) {
  const [scheme, setScheme] = useState(RESOURCE_TYPES[0].scheme);
  const [filename, setFilename] = useState('');

  const type = resourceTypeOf(scheme)!;
  const path = filename.trim() ? buildResourcePath(scheme, filename) : '';

  const submit = () => {
    if (!path) return;
    onAdd(path, type.starter(basenameOfPath(path)));
    setFilename('');
  };

  return (
    <div style={{ marginBottom: 12, flexShrink: 0 }}>
      <div className="entity-row" style={{ gap: 6, marginBottom: 6 }}>
        <select
          value={scheme}
          onChange={(e) => setScheme(e.target.value)}
          style={{ flex: 1, minWidth: 0, fontSize: 12 }}
        >
          {RESOURCE_TYPES.map((t) => (
            <option key={t.scheme} value={t.scheme}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="entity-row" style={{ gap: 6 }}>
        <input
          className="mono"
          style={{ flex: 1, minWidth: 0, fontSize: 11.5 }}
          placeholder={`utils${type.ext}`}
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={!path} aria-label="Add resource">
          <Icon name="plus" size={13} />
        </button>
      </div>
      <div className="field-hint" style={{ marginTop: 5 }}>
        {path ? (
          <span className="mono">{path}</span>
        ) : (
          type.hint
        )}
      </div>
    </div>
  );
}

// The reference element differs by resource type (<IncludeURL> for a shared
// jsc helper, <SchemaFile> for graphql, <Read><Name> for a property set), and
// only certain policy types can reference each — so this offers exactly the
// policies that can take this file, and writes the right element for them.
function LinkControl({
  resource,
  policies,
  onLink,
  onUnlink,
  onOpenPolicy,
}: {
  resource: BundleResource;
  policies: Policy[];
  onLink: (resourceId: string, policyId: string) => void;
  onUnlink: (resourceId: string, policyId: string) => void;
  onOpenPolicy: (policyId: string) => void;
}) {
  const scheme = schemeOfPath(resource.path);
  const type = resourceTypeOf(scheme);
  const eligibleTypes = policyTypesForScheme(scheme);
  const linked = policies.filter((p) => policyReferencesResource(p.xml, resource.path));
  const linkable = policies.filter((p) => eligibleTypes.includes(p.type) && !linked.some((l) => l.id === p.id));

  return (
    <div className="card" style={{ padding: '10px 12px', marginBottom: 10, flexShrink: 0 }}>
      <div className="entity-row" style={{ background: 'transparent', border: 'none', padding: 0, flexWrap: 'wrap' }}>
        <span className="field-hint" style={{ flexShrink: 0 }}>
          Linked to
        </span>
        {linked.length === 0 && <span className="field-hint">nothing yet</span>}
        {linked.map((p) => (
          <span key={p.id} className="template-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              style={{ cursor: 'pointer' }}
              title="Open this policy"
              onClick={() => onOpenPolicy(p.id)}
            >
              {p.name}
            </span>
            <button
              className="icon-btn"
              style={{ width: 16, height: 16 }}
              title={`Remove the reference from ${p.name}`}
              onClick={() => onUnlink(resource.id, p.id)}
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {linkable.length > 0 ? (
            <select
              value=""
              style={{ fontSize: 12 }}
              onChange={(e) => e.target.value && onLink(resource.id, e.target.value)}
            >
              <option value="">Link to a policy…</option>
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="field-hint">
              {eligibleTypes.length
                ? `No unlinked ${eligibleTypes.join('/')} policy to link — add one on the Policies tab.`
                : 'No policy type references this kind of file.'}
            </span>
          )}
        </div>
      </div>
      {type && (
        <div className="field-hint" style={{ marginTop: 6 }}>
          {type.linkElement === 'PropertySetName'
            ? 'Linking sets the policy’s <Read><Name> to this file’s basename.'
            : `Linking adds <${type.linkElement}>${resourceUri(resource.path)}</${type.linkElement}> to the policy.`}
        </div>
      )}
    </div>
  );
}

export function ResourcesPanel({
  resources,
  policies,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onRename,
  onDelete,
  onLink,
  onUnlink,
  onOpenPolicy,
}: {
  resources: BundleResource[];
  policies: Policy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (path: string, content: string) => void;
  onUpdate: (id: string, content: string) => void;
  onRename: (id: string, path: string) => void;
  onDelete: (id: string) => void;
  onLink: (resourceId: string, policyId: string) => void;
  onUnlink: (resourceId: string, policyId: string) => void;
  onOpenPolicy: (policyId: string) => void;
}) {


  const [toDelete, setToDelete] = useState<{ id: string; path: string } | null>(null);

  const selected = resources.find((r) => r.id === selectedId) || resources[0];

  if (!resources.length) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
        <Icon name="folder-code" size={26} color="var(--text-3)" />
        <h4 style={{ margin: '14px 0 6px' }}>No shared resources yet</h4>
        <p className="card-subtitle" style={{ margin: '0 0 18px', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
          Files here belong to the bundle, not to any one policy — the place for a{' '}
          <code className="mono">resources/jsc/utils.js</code> helper pulled into several Javascript policies via{' '}
          <code className="mono">{'<IncludeURL>'}</code>, or a shared <code className="mono">.properties</code> file. Policies point at
          these files from their own XML — link one below, or on the policy itself.
        </p>
        <div style={{ maxWidth: 320, margin: '0 auto' }}>
          <AddResourceRow onAdd={onAdd} />
        </div>
      </div>
    );
  }

  return (
    <div className="policies-layout">
      <div className="policy-list-col">
        <AddResourceRow onAdd={onAdd} />
        <div className="policy-list">
          {resources.map((r) => {
            const refCount = referencingPolicies(r, policies).length;
            return (
              <div
                key={r.id}
                className={`policy-list-item ${selected?.id === r.id ? 'active' : ''}`}
                onClick={() => onSelect(r.id)}
              >
                <Icon name="file-code" size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="policy-list-item-name mono">{r.path.split('/').pop()}</div>
                  <div className="policy-list-item-type mono">{r.path}</div>
                </div>
                <span className="field-hint" style={{ flexShrink: 0 }} title="Policies referencing this file">
                  {refCount > 0 ? `${refCount}×` : 'unused'}
                </span>
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setToDelete({ id: r.id, path: r.path });
                  }}
                  aria-label="Delete resource"
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
            <input
              className="mono"
              defaultValue={selected.path}
              key={selected.id}
              onBlur={(e) => {
                if (e.target.value.trim() !== selected.path) onRename(selected.id, e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <span className="template-badge" style={{ flexShrink: 0 }}>
              {resourceTypeOf(schemeOfPath(selected.path))?.label ?? schemeOfPath(selected.path)}
            </span>
          </div>
          <LinkControl resource={selected} policies={policies} onLink={onLink} onUnlink={onUnlink} onOpenPolicy={onOpenPolicy} />
          <div className="monaco-wrap">
            <Editor
              key={selected.id}
              defaultLanguage={resourceLanguage(selected.path)}
              theme="apigee-dark"
              beforeMount={setupApigeeMonaco}
              value={selected.content}
              onChange={(value) => onUpdate(selected.id, value || '')}
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

      {toDelete && (
        <ConfirmModal
          title="Delete resource?"
          message={`"${toDelete.path}" will be removed from the bundle. Policies referencing it via IncludeURL/ResourceURL will fail to deploy until you update or remove that reference.`}
          onConfirm={() => onDelete(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
