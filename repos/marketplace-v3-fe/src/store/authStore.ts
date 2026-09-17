import { create } from "zustand";

import type { AuthUser } from "@/features/auth/types";

interface AuthStoreState {
  currentUser: AuthUser | null;
  isAuthInitialized: boolean;
  /**
   * True while a logout request is in flight (API call in progress,
   * before the hard-navigation redirect fires). Purely for UI feedback -
   * e.g. disabling the confirm dialog's buttons while it settles.
   */
  isLoggingOut: boolean;
  isLogoutConfirmOpen: boolean;
  setCurrentUser: (user: AuthUser) => void;
  clearCurrentUser: () => void;
  setIsAuthInitialized: (isInitialized: boolean) => void;
  setIsLoggingOut: (isLoggingOut: boolean) => void;
  openLogoutConfirm: () => void;
  closeLogoutConfirm: () => void;
}

export const useStore = create<AuthStoreState>()((set) => ({
  currentUser: null,
  isAuthInitialized: false,
  isLoggingOut: false,
  isLogoutConfirmOpen: false,
  setCurrentUser: (user) =>
    set({ currentUser: user, isAuthInitialized: true }),
  clearCurrentUser: () => set({ currentUser: null }),
  setIsAuthInitialized: (isInitialized) =>
    set({ isAuthInitialized: isInitialized }),
  setIsLoggingOut: (isLoggingOut) => set({ isLoggingOut }),
  openLogoutConfirm: () => set({ isLogoutConfirmOpen: true }),
  closeLogoutConfirm: () => set({ isLogoutConfirmOpen: false }),
}));
