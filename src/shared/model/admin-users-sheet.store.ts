import { create } from "zustand";

interface AdminUsersSheetState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

/**
 * User-administration sheet open/close state (the same mechanism as the profile sheet): opened
 * from the settings dropdown by a super administrator, mounted once in AppProviders.
 */
export const useAdminUsersSheetStore = create<AdminUsersSheetState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
