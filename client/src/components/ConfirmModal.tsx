import { Modal } from './Modal';

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="confirm-text">{message}</p>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className={danger ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
