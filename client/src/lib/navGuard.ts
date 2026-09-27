import { create } from 'zustand';
import { useStore } from '../store/useStore';
import { useSharedFlowStore } from '../store/useSharedFlowStore';

/**
 * Nothing in this app autosaves, and every way of leaving the open document
 * used to replace it outright: `openProxy` sets `currentProxy` to whatever it
 * just fetched, and unsaved edits went with it — no dialog, no toast, no
 * recovery. One misclick in the sidebar and an afternoon on a 27-policy proxy
 * was gone, and the only clue anything had been lost was that the dirty dot
 * stopped being there.
 *
 * The guard is here rather than inside the store actions because the answer is
 * a dialog, and stores don't render. Call sites ask to navigate; this decides
 * whether the request can go straight through.
 */

/** The unsaved document's name, or null when there is nothing to lose. */
export function dirtyDocName(): string | null {
  const sharedFlow = useSharedFlowStore.getState();
  if (sharedFlow.currentSharedFlow && sharedFlow.dirty) return sharedFlow.currentSharedFlow.name;
  const proxy = useStore.getState();
  if (proxy.currentProxy && proxy.dirty) return proxy.currentProxy.name;
  return null;
}

/** Saves whichever document is dirty. Both actions report their own failures. */
async function saveDirtyDoc(): Promise<void> {
  const sharedFlow = useSharedFlowStore.getState();
  if (sharedFlow.currentSharedFlow && sharedFlow.dirty) {
    await sharedFlow.saveSharedFlow();
    return;
  }
  const proxy = useStore.getState();
  if (proxy.currentProxy && proxy.dirty) await proxy.saveProxy();
}

type NavGuardState = {
  /** The navigation waiting on an answer, and the name it would discard. */
  pending: { run: () => void; docName: string } | null;
  saving: boolean;
  requestNavigation: (run: () => void) => void;
  discardAndGo: () => void;
  saveAndGo: () => Promise<void>;
  cancel: () => void;
};

export const useNavGuard = create<NavGuardState>((set, get) => ({
  pending: null,
  saving: false,

  requestNavigation(run) {
    const docName = dirtyDocName();
    if (!docName) {
      run();
      return;
    }
    set({ pending: { run, docName } });
  },

  discardAndGo() {
    const pending = get().pending;
    set({ pending: null });
    pending?.run();
  },

  async saveAndGo() {
    if (get().saving) return;
    set({ saving: true });
    try {
      await saveDirtyDoc();
    } finally {
      set({ saving: false });
    }
    // The save actions catch their own errors and only clear `dirty` when the
    // write landed, so a document that is still dirty is a failed save. Leave
    // the dialog up: navigating now would discard exactly what the user asked
    // to keep, and the error toast is already on screen explaining why.
    if (dirtyDocName()) return;
    const pending = get().pending;
    set({ pending: null });
    pending?.run();
  },

  cancel() {
    set({ pending: null });
  },
}));
