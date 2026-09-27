import { Modal } from './Modal';
import { useNavGuard } from '../lib/navGuard';

/**
 * Raised when something tries to leave a document with unsaved edits. Three
 * answers, because two would force a choice nobody wants to make: "Save" is
 * what most people mean, "Discard" is the deliberate throw-away, and "Cancel"
 * is the way back for the misclick that raised this in the first place.
 *
 * Save is the default action and Cancel is the safe one, so Escape and the
 * backdrop both land on Cancel — a stray keystroke can't discard anything.
 */
export function UnsavedChangesModal() {
  const pending = useNavGuard((s) => s.pending);
  const saving = useNavGuard((s) => s.saving);
  const cancel = useNavGuard((s) => s.cancel);
  const discardAndGo = useNavGuard((s) => s.discardAndGo);
  const saveAndGo = useNavGuard((s) => s.saveAndGo);

  if (!pending) return null;

  return (
    <Modal title="Unsaved changes" onClose={cancel}>
      <p className="confirm-text">
        “{pending.docName}” has changes that haven’t been saved. Nothing here saves on its own, so leaving now
        discards them.
      </p>
      <div className="modal-footer">
        <button className="btn btn-ghost" onClick={cancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-danger" onClick={discardAndGo} disabled={saving}>
          Discard changes
        </button>
        <button className="btn btn-primary" onClick={saveAndGo} disabled={saving} autoFocus>
          {saving ? <span className="spinner" /> : null}
          Save and continue
        </button>
      </div>
    </Modal>
  );
}
