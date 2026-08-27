import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';

export function SaveAsTemplateModal({ onClose }: { onClose: () => void }) {
  const currentProxy = useStore((s) => s.currentProxy);
  const saveAsTemplate = useStore((s) => s.saveAsTemplate);
  const [name, setName] = useState(currentProxy ? `${currentProxy.name} Template` : '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await saveAsTemplate(name.trim(), description.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Save as Template" onClose={onClose}>
      <p className="confirm-text" style={{ marginBottom: 16 }}>
        This snapshots the current policies, flows and route rules as a reusable skeleton. Future proxies can start
        from it in one click.
      </p>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>Template Name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea
          placeholder="What makes this template useful?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? <span className="spinner" /> : 'Save Template'}
        </button>
      </div>
    </Modal>
  );
}
