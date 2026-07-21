import { create } from "zustand";

interface ProfileSheetState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * Profile sheet open/close state.
 */
export const useProfileSheetStore = create<ProfileSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
