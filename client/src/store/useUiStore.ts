import { create } from 'zustand';

const SIDEBAR_KEY = 'aps.sidebarCollapsed';

/** Reading localStorage can throw outright in a locked-down browser profile. */
function readSidebarPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Chrome-level UI state that doesn't belong to a proxy or a shared flow.
 * Kept out of those stores so opening the palette can't mark anything dirty.
 */
interface UiStoreState {
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  /** The log panel. Same reasoning: viewing logs must not touch document state. */
  logConsoleOpen: boolean;
  openLogConsole: () => void;
  closeLogConsole: () => void;
  toggleLogConsole: () => void;

  /**
   * The user's own preference for the sidebar, persisted across sessions. A
   * narrow window collapses the rail regardless — see App — but that is a
   * separate fact and must not overwrite what the user chose, or widening the
   * window back would silently lose their setting.
   */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  /**
   * Which conditional flow cards are open, by flow id.
   *
   * It lives here rather than in ConditionalFlowsSection because the tabs are
   * mounted conditionally: stepping over to Policies to check a name unmounts
   * the section, and local state would collapse everything again on the way
   * back. Flow ids are random and never reused, so ids left behind by a proxy
   * you have since closed simply never match anything and cost nothing.
   */
  expandedFlowIds: string[];
  setFlowExpanded: (id: string, expanded: boolean) => void;
  setManyFlowsExpanded: (ids: string[], expanded: boolean) => void;

  /**
   * A flow something elsewhere asked to be shown — today the command palette's
   * Flows results. Those used to call setActiveTab and nothing else, which on a
   * thirteen-flow proxy dropped you at the top of the section and left you to
   * find the flow you had just searched for by hand. The section that owns the
   * flow expands it, scrolls to it and clears this.
   */
  revealedFlowId: string | null;
  revealFlow: (id: string) => void;
  clearRevealedFlow: () => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  logConsoleOpen: false,
  openLogConsole: () => set({ logConsoleOpen: true }),
  closeLogConsole: () => set({ logConsoleOpen: false }),
  toggleLogConsole: () => set((s) => ({ logConsoleOpen: !s.logConsoleOpen })),

  sidebarCollapsed: readSidebarPreference(),
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
      } catch {
        // A preference that can't be written is still a preference for this
        // session — the toggle works, it just won't be there next time.
      }
      return { sidebarCollapsed };
    }),

  expandedFlowIds: [],
  setFlowExpanded: (id, expanded) =>
    set((s) => ({
      expandedFlowIds: expanded
        ? s.expandedFlowIds.includes(id)
          ? s.expandedFlowIds
          : [...s.expandedFlowIds, id]
        : s.expandedFlowIds.filter((x) => x !== id),
    })),
  setManyFlowsExpanded: (ids, expanded) =>
    set((s) => {
      const touched = new Set(ids);
      const kept = s.expandedFlowIds.filter((x) => !touched.has(x));
      return { expandedFlowIds: expanded ? [...kept, ...ids] : kept };
    }),

  revealedFlowId: null,
  revealFlow: (id) => set({ revealedFlowId: id }),
  clearRevealedFlow: () => set({ revealedFlowId: null }),
}));
