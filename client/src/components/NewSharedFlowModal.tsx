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
    <Modal title="New Shared Flow" onClose={onClose}>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Shared Flow Name</label>
        <input
          autoFocus
          placeholder="oauth-v2-shared-flow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <span className="field-hint">Becomes the .zip filename and root SharedFlowBundle name.</span>
      </div>
      <div className="field">
        <label>Description</label>
        <textarea
          placeholder="What does this shared flow do?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 10 }}>{error}</p>}
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? <span className="spinner" /> : 'Create Shared Flow'}
        </button>
      </div>
    </Modal>
  );
}
