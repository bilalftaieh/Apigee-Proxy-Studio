import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { DiffModal } from './DiffModal';
import { api } from '../api/client';
import type { Proxy } from '../types/proxy';

// The drift check: "you exported a zip, imported it, tweaked something in the
// console three weeks later, forgot, and your local copy is now silently
// stale." Drop the zip back in and diff it against the local proxy — same
// diff engine as the snapshot view, just with an ad-hoc parsed-not-saved
// right-hand side instead of a snapshot pointer.
export function DriftCompareModal({ onClose, currentProxy }: { onClose: () => void; currentProxy: Proxy }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<Proxy | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { proxy } = await api.parseProxyZip(file);
      setImported(proxy);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (imported) {
    return (
      <DiffModal
        onClose={onClose}
        leftLabel="local"
        rightLabel="uploaded bundle"
        left={{ proxy: currentProxy }}
        right={{ proxy: imported }}
      />
    );
  }

  return (
    <Modal title="Compare with a downloaded bundle" onClose={onClose}>
      <p className="confirm-text" style={{ marginBottom: 16 }}>
        Drop in a .zip exported from Apigee (e.g. after editing this proxy in the console) to see exactly what
        differs from your local copy here.
      </p>
      <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleFile} />
      <button className="quickstart-card" onClick={() => fileRef.current?.click()} disabled={busy}>
        <div className="quickstart-card-icon">{busy ? <span className="spinner" /> : <Icon name="upload" size={18} />}</div>
        <h3>{busy ? 'Parsing…' : 'Choose a .zip bundle'}</h3>
        <p>Nothing is saved — this is a one-off comparison against your current local proxy.</p>
      </button>
      {error && (
        <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 12 }}>{error}</p>
      )}
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
