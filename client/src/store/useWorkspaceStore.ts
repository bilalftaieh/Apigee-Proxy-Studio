import { create } from 'zustand';
import { api } from '../api/client';
import { useStore } from './useStore';
import { useSharedFlowStore } from './useSharedFlowStore';
import type { WorkspaceAudit } from '../types/workspace';

export type WorkspaceTabKey = 'governance' | 'basePaths' | 'backends' | 'sharedFlows';

/**
 * The workspace audit is a third top-level view alongside the proxy and shared
 * flow editors — it belongs to the workspace, not to whatever is open. Opening
 * it therefore closes both editors rather than layering over them, the same way
 * they already close each other.
 *
 * The audit reads saved state from disk, so an editor with unsaved changes
 * would produce a result that doesn't match what you're looking at. Rather than
 * try to merge the two, `openWorkspace` refuses while anything is dirty and
 * says why.
 */
interface WorkspaceStoreState {
  open: boolean;
  audit: WorkspaceAudit | null;
  loading: boolean;
  error: string | null;
  activeTab: WorkspaceTabKey;

  openWorkspace: () => Promise<void>;
  closeWorkspace: () => void;
  refresh: () => Promise<void>;
  setActiveTab: (tab: WorkspaceTabKey) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  open: false,
  audit: null,
  loading: false,
  error: null,
  activeTab: 'governance',

  openWorkspace: async () => {
    const proxy = useStore.getState();
    const sharedFlow = useSharedFlowStore.getState();
    if (proxy.dirty || sharedFlow.dirty) {
      proxy.pushToast('Save your changes first — the workspace audit reads what\'s on disk.', 'info');
      return;
    }
    proxy.closeProxy();
    sharedFlow.closeSharedFlow();
    set({ open: true });
    await get().refresh();
  },

  closeWorkspace: () => set({ open: false }),

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      set({ audit: await api.auditWorkspace(), loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  setActiveTab: (activeTab) => set({ activeTab }),
}));
