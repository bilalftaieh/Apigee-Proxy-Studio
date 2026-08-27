import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import type { Template } from '../types/proxy';
import { Icon } from './Icon';

function slugify(input: string) {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'proxy'
  );
}

export function UseTemplateModal({ template, onClose }: { template: Template; onClose: () => void }) {
  const createFromTemplate = useStore((s) => s.createFromTemplate);
  const [name, setName] = useState(`${template.proxy.name}-copy`);
  const [basePath, setBasePath] = useState(`/${slugify(template.proxy.name)}-copy`);
  const [basePathTouched, setBasePathTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setError('Give your proxy a name.');
    setBusy(true);
    setError(null);
    try {
      await createFromTemplate(template.id, { name: name.trim(), basePath: basePath.trim() });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`New Proxy from "${template.name}"`} onClose={onClose}>
      <div
        className="card"
        style={{ padding: 12, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}
      >
        <div className="quickstart-card-icon" style={{ marginBottom: 0 }}>
          <Icon name="layout-template" size={17} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{template.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{template.description}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            {template.proxy.policies.length} polic{template.proxy.policies.length === 1 ? 'y' : 'ies'} &middot;{' '}
            {template.proxy.flows.length} conditional flow{template.proxy.flows.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Proxy Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!basePathTouched) setBasePath(`/${slugify(e.target.value)}`);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      <div className="field">
        <label>Base Path</label>
        <input
          value={basePath}
          onChange={(e) => {
            setBasePathTouched(true);
            setBasePath(e.target.value);
          }}
        />
      </div>
      {error && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 10 }}>{error}</p>}
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? <span className="spinner" /> : 'Create Proxy'}
        </button>
      </div>
    </Modal>
  );
}
