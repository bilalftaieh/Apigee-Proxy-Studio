import { useState } from 'react';
import { Modal } from './Modal';
import { useSharedFlowStore } from '../store/useSharedFlowStore';

export function NewSharedFlowModal({ onClose }: { onClose: () => void }) {
  const createSharedFlow = useSharedFlowStore((s) => s.createSharedFlow);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setError('Give your shared flow a name.');
    setBusy(true);
    setError(null);
    try {
      await createSharedFlow({ name: name.trim(), description });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create new shared flow" onClose={onClose}>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Shared flow name</label>
        <input
          autoFocus
          placeholder="e.g., oauth-v2-shared-flow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div className="field-hint">Lowercase letters, numbers, and hyphens only. Becomes the .zip filename and root SharedFlowBundle name.</div>
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <textarea
          placeholder="Briefly describe what this shared flow does"
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
              Creating shared flow...
            </>
          ) : (
            'Create shared flow'
          )}
        </button>
      </div>
    </Modal>
  );
}
