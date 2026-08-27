import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { DiffModal } from './DiffModal';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import type { HistorySnapshotSummary } from '../types/proxy';

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleString();
}

export function HistoryModal({ onClose }: { onClose: () => void }) {
  const currentProxy = useStore((s) => s.currentProxy)!;
  const historyList = useStore((s) => s.historyList);
  const historyLoading = useStore((s) => s.historyLoading);
  const loadHistory = useStore((s) => s.loadHistory);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);
  const [toRestore, setToRestore] = useState<HistorySnapshotSummary | null>(null);
  const [toDiff, setToDiff] = useState<HistorySnapshotSummary | null>(null);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal title="Save History" onClose={onClose} wide>
      <p className="confirm-text" style={{ marginBottom: 16 }}>
        A snapshot is taken automatically every time you save. Restoring snapshots the current state first, so you
        can always undo a restore too.
      </p>

      {historyLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0' }}>
          <span className="spinner" /> Loading history…
        </div>
      )}

      {!historyLoading && historyList.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
          <Icon name="history" size={24} />
          <p style={{ marginTop: 10, fontSize: 13 }}>No saves yet — history builds up as you save this proxy.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
        {historyList.map((snap) => (
          <div className="entity-row" key={snap.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{formatRelativeTime(snap.savedAt)}</div>
              <div className="field-hint mono">
                {snap.name} &middot; {snap.basePath} &middot; {snap.policyCount} polic{snap.policyCount === 1 ? 'y' : 'ies'} &middot;{' '}
                {snap.flowCount} flow{snap.flowCount === 1 ? '' : 's'}
              </div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setToDiff(snap)}>
              <Icon name="git-compare" size={12} /> Diff vs current
            </button>
            <button className="btn btn-sm" onClick={() => setToRestore(snap)}>
              <Icon name="rotate-ccw" size={12} /> Restore
            </button>
          </div>
        ))}
      </div>

      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {toRestore && (
        <ConfirmModal
          title="Restore this version?"
          message={`This replaces your current policies, flows and targets with the version saved ${formatRelativeTime(
            toRestore.savedAt
          )}. Your current state is snapshotted first, so this can be undone too.`}
          confirmLabel="Restore"
          danger={false}
          onConfirm={() => {
            restoreSnapshot(toRestore.id);
            setToRestore(null);
            onClose();
          }}
          onClose={() => setToRestore(null)}
        />
      )}

      {toDiff && (
        <DiffModal
          onClose={() => setToDiff(null)}
          leftLabel={`saved ${formatRelativeTime(toDiff.savedAt)}`}
          rightLabel="current"
          left={{ proxyId: currentProxy.id, snapshotId: toDiff.id }}
          right={{ proxy: currentProxy }}
        />
      )}
    </Modal>
  );
}
