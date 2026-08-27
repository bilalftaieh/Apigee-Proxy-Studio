import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import { suggestPolicyName } from '../lib/policyNames';
import { RESOURCE_TYPES, applyExtension, buildResourcePath, resourceUri } from '../lib/resourceTypes';
import type { PolicyResourceChoice } from '../store/useStore';
import type { BundleResource, Policy } from '../types/proxy';

/** The resources/<scheme>/ folder a policy of this type reads its file from. */
function resourceTypeForPolicy(policyType: string) {
  return RESOURCE_TYPES.find((t) => t.policyTypes.includes(policyType));
}

export function AddPolicyModal({
  onClose,
  policies,
  resources = [],
  onAdd,
  allowChains = false,
}: {
  onClose: () => void;
  /** Existing policies in the target bundle (proxy or shared flow) — used to number the suggested name. */
  policies: Policy[];
  /** Resource files already in the bundle — offered as an alternative to creating a new one. */
  resources?: BundleResource[];
  onAdd: (type: string, name: string, resourceChoice?: PolicyResourceChoice) => Promise<void>;
  /** Policy chains wire into PreFlow/PostFlow/fault rules, which only proxies have — shared flows opt out. */
  allowChains?: boolean;
}) {
  const policyTypes = useStore((s) => s.policyTypes);
  const policyChains = useStore((s) => s.policyChains);
  const addPolicyChain = useStore((s) => s.addPolicyChain);
  const [mode, setMode] = useState<'chains' | 'gallery'>(allowChains && policyChains.length ? 'chains' : 'gallery');
  const [addingChain, setAddingChain] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [standardOnly, setStandardOnly] = useState(false);
  const [name, setName] = useState('');
  const [resourceMode, setResourceMode] = useState<'new' | 'existing'>('new');
  const [resourceFilename, setResourceFilename] = useState('');
  const [existingResourceId, setExistingResourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = policyTypes.find((p) => p.key === selectedKey);

  // Whether this bundle is *already* billed at the Extensible rate. If it is,
  // adding another Extensible policy costs nothing extra and there's nothing
  // worth warning about; if it isn't, the first one re-tiers every call.
  const alreadyExtensible = useMemo(
    () => policies.some((p) => policyTypes.find((t) => t.key === p.type)?.tier === 'extensible'),
    [policies, policyTypes]
  );
  const wouldChangeTier = selectedType?.tier === 'extensible' && !alreadyExtensible;

  const handleAddChain = async (chainKey: string) => {
    setAddingChain(chainKey);
    try {
      await addPolicyChain(chainKey);
      onClose();
    } finally {
      setAddingChain(null);
    }
  };

  const grouped = useMemo(() => {
    const q = filter.toLowerCase();
    const filtered = policyTypes.filter(
      (p) =>
        (p.label.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) &&
        (!standardOnly || p.tier === 'standard')
    );
    const map = new Map<string, typeof policyTypes>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return map;
  }, [policyTypes, filter, standardOnly]);

  const pickType = (key: string) => {
    const suggested = suggestPolicyName(key, policies);
    const resType = resourceTypeForPolicy(key);
    setSelectedKey(key);
    setName(suggested);
    // Default to a new file named after the policy — what this used to do
    // silently, now visible and editable before the policy exists.
    setResourceMode('new');
    setResourceFilename(resType ? `${suggested}${resType.ext}` : '');
    setExistingResourceId(reusableResources(key)[0]?.id ?? '');
    setError(null);
  };

  // Files of the right kind for this policy type — a Javascript policy can only
  // run a resources/jsc file, and so on.
  function reusableResources(policyType: string) {
    const resType = resourceTypeForPolicy(policyType);
    if (!resType) return [];
    return resources.filter((r) => r.path.startsWith(`resources/${resType.scheme}/`));
  }

  const submit = async () => {
    if (!selectedKey) return;
    if (!name.trim()) return setError('Give the policy a name.');
    const resType = resourceTypeForPolicy(selectedKey);
    let choice: PolicyResourceChoice | undefined;
    if (resType) {
      if (resourceMode === 'existing') {
        if (!existingResourceId) return setError('Pick an existing file, or switch to creating a new one.');
        choice = { mode: 'existing', resourceId: existingResourceId };
      } else {
        if (!resourceFilename.trim()) return setError('Give the resource file a name.');
        choice = { mode: 'new', path: buildResourcePath(resType.scheme, resourceFilename) };
      }
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(selectedKey, name.trim(), choice);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (selectedType) {
    return (
      <Modal title={`Add ${selectedType.label} Policy`} onClose={onClose}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 14 }}
          onClick={() => setSelectedKey(null)}
        >
          <Icon name="arrow-left" size={13} /> Back to gallery
        </button>
        <p className="confirm-text" style={{ marginBottom: 12 }}>
          <span className={`tier-badge ${selectedType.tier}`}>
            {selectedType.tier === 'standard' ? 'Standard' : 'Extensible'}
          </span>{' '}
          {selectedType.description}
        </p>
        {wouldChangeTier && (
          <div className="tier-callout">
            <Icon name="circle-dollar-sign" size={15} />
            <div>
              <strong>This makes the proxy an Extensible proxy.</strong> It's the first Extensible policy here, and
              Apigee then bills <em>every</em> call to this proxy at the Extensible rate — not just calls that reach
              this policy. If a Standard policy can do the job, prefer it (e.g. HTTP Modifier instead of Assign
              Message for header work). Check your plan's entitlements for the actual rates.
            </div>
          </div>
        )}
        <div className="field">
          <label>Policy Name</label>
          <input
            autoFocus
            className="mono"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <span className="field-hint">Used as the file name inside apiproxy/policies/.</span>
        </div>
        {(() => {
          const resType = resourceTypeForPolicy(selectedType.key);
          if (!resType) return null;
          const reusable = reusableResources(selectedType.key);
          const newPath = resourceFilename.trim() ? buildResourcePath(resType.scheme, resourceFilename) : '';
          const collides = !!newPath && resources.some((r) => r.path === newPath);
          return (
            <div className="field">
              <label>{resType.label.replace(/ \([a-z]+\)$/, '')} file</label>
              <div className="mode-toggle" style={{ marginBottom: 8 }}>
                <button type="button" className={resourceMode === 'new' ? 'active' : ''} onClick={() => setResourceMode('new')}>
                  <Icon name="file-plus" size={12} /> New file
                </button>
                <button
                  type="button"
                  className={resourceMode === 'existing' ? 'active' : ''}
                  disabled={!reusable.length}
                  title={reusable.length ? undefined : `No resources/${resType.scheme}/ file in this bundle yet`}
                  onClick={() => setResourceMode('existing')}
                >
                  <Icon name="folder-code" size={12} /> Existing file
                </button>
              </div>
              {resourceMode === 'new' ? (
                <>
                  <input
                    className="mono"
                    value={resourceFilename}
                    placeholder={`utils${resType.ext}`}
                    onChange={(e) => setResourceFilename(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                  />
                  <span className="field-hint">
                    {collides ? (
                      <span style={{ color: 'var(--warning)' }}>
                        {newPath} already exists — pick another name, or switch to Existing file to reuse it.
                      </span>
                    ) : (
                      <>
                        Created as <span className="mono">{newPath || `resources/${resType.scheme}/…`}</span> and editable on
                        the Resources tab.
                      </>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <select value={existingResourceId} onChange={(e) => setExistingResourceId(e.target.value)}>
                    {reusable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.path}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">
                    The policy will reference{' '}
                    <span className="mono">
                      {resourceUri(reusable.find((r) => r.id === existingResourceId)?.path || reusable[0]?.path || '')}
                    </span>{' '}
                    — no new file is created, and edits to it affect every policy using it.
                  </span>
                </>
              )}
            </div>
          );
        })()}
        {error && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? <span className="spinner" /> : 'Add Policy'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Policy" onClose={onClose} wide>
      {allowChains && policyChains.length > 0 && (
        <div className="mode-toggle" style={{ marginBottom: 16 }}>
          <button type="button" className={mode === 'chains' ? 'active' : ''} onClick={() => setMode('chains')}>
            <Icon name="layers" size={12} /> Chains
          </button>
          <button type="button" className={mode === 'gallery' ? 'active' : ''} onClick={() => setMode('gallery')}>
            <Icon name="shield" size={12} /> Individual Policies
          </button>
        </div>
      )}

      {mode === 'chains' ? (
        <div className="chain-grid">
          {policyChains.map((chain) => (
            <button
              key={chain.key}
              className="chain-card"
              disabled={!!addingChain}
              onClick={() => handleAddChain(chain.key)}
            >
              <div className="chain-card-head">
                <div className="policy-card-icon" style={{ background: `${chain.accent}22`, color: chain.accent }}>
                  <Icon name={chain.icon} size={16} />
                </div>
                <h4>{chain.label}</h4>
              </div>
              <p>{chain.description}</p>
              <div className="chain-card-steps">
                {chain.steps.map((step, i) => {
                  const type = policyTypes.find((t) => t.key === step.type);
                  return (
                    <span className="chip mono" key={i}>
                      {type?.label || step.type}
                    </span>
                  );
                })}
              </div>
              <div className="chain-card-cta">
                {addingChain === chain.key ? (
                  <span className="spinner" />
                ) : (
                  <>
                    <Icon name="plus" size={13} /> Add chain — {chain.steps.length} policies
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <input placeholder="Search policy types…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="mode-toggle">
              <button type="button" className={!standardOnly ? 'active' : ''} onClick={() => setStandardOnly(false)}>
                All tiers
              </button>
              <button
                type="button"
                className={standardOnly ? 'active' : ''}
                onClick={() => setStandardOnly(true)}
                title="Standard policies deploy to any environment type and keep the proxy on the cheaper billing tier."
              >
                Standard only
              </button>
            </div>
          </div>
          {alreadyExtensible && !standardOnly && (
            <p className="field-hint" style={{ marginBottom: 12 }}>
              This proxy already uses at least one Extensible policy, so it is billed at the Extensible rate regardless
              of what you add next.
            </p>
          )}
          <div style={{ maxHeight: 440, overflowY: 'auto', paddingRight: 4 }}>
            {[...grouped.entries()].map(([category, items]) => (
              <div key={category} style={{ marginBottom: 16 }}>
                <div className="section-label" style={{ marginTop: 0 }}>
                  {category}
                </div>
                <div className="policy-gallery">
                  {items.map((p) => (
                    <button key={p.key} className="policy-card" onClick={() => pickType(p.key)}>
                      <span className={`tier-badge ${p.tier} policy-card-tier`}>
                        {p.tier === 'standard' ? 'Standard' : 'Extensible'}
                      </span>
                      <div className="policy-card-icon" style={{ background: `${p.accent}22`, color: p.accent }}>
                        <Icon name={p.icon} size={15} />
                      </div>
                      <h4>{p.label}</h4>
                      <p>{p.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
