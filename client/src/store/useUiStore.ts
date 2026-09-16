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
}));
