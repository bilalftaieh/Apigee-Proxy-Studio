import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';

function slugify(input: string) {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'proxy'
  );
}

export function NewProxyModal({ onClose }: { onClose: () => void }) {
  const createProxy = useStore((s) => s.createProxy);
  const [name, setName] = useState('');
  const [basePath, setBasePath] = useState('');
  const [basePathTouched, setBasePathTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setError('Give your proxy a name.');
    setBusy(true);
    setError(null);
    try {
      await createProxy({ name: name.trim(), basePath: basePath.trim() || `/${slugify(name)}`, description });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create new proxy" onClose={onClose}>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Proxy name</label>
        <input
          autoFocus
          placeholder="e.g., payment-service-api"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!basePathTouched) setBasePath(`/${slugify(e.target.value)}`);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div className="field-hint">Lowercase letters, numbers, and hyphens only. Max 49 characters.</div>
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Base path</label>
        <input
          placeholder="e.g., /payments/v1"
          value={basePath}
          onChange={(e) => {
            setBasePathTouched(true);
            setBasePath(e.target.value);
          }}
        />
        <div className="field-hint">Must start with /. Used to route requests to this proxy.</div>
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <textarea
          placeholder="Briefly describe the proxy's purpose and target backend"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error && <p style={{ color: 'var(--error-ink)', fontSize: 12, marginTop: 10 }}>{error}</p>}
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? (
            <>
              <span className="spinner" />
              Creating proxy...
            </>
          ) : (
            'Create proxy'
          )}
        </button>
      </div>
    </Modal>
  );
}
