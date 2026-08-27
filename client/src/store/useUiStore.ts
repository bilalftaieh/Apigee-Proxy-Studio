import { create } from 'zustand';

/**
 * Chrome-level UI state that doesn't belong to a proxy or a shared flow.
 * Kept out of those stores so opening the palette can't mark anything dirty.
 */
interface UiStoreState {
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
}));
