import { onAuthStateChanged, signOut, type Unsubscribe } from "firebase/auth";
import { create } from "zustand";
import { auth } from "@/shared/api/firebase";
import { userApi } from "../api/user.api";
import type { User } from "../types/user.types";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  observeAuthState: () => Unsubscribe;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  observeAuthState: () => {
    set({ loading: true });

    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        set({ user: null, loading: false });
        return;
      }

      const existing = await userApi.getById(firebaseUser.uid);

      if (existing) {
        if (existing.deactivated) {
          await signOut(auth);
          set({ user: null, loading: false });
          return;
        }
        set({ user: existing, loading: false });
        return;
      }

      // First login — create user as Guest
      const newUser: User = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? "",
        name: firebaseUser.displayName ?? "",
        photo: firebaseUser.photoURL ?? "",
        roles: ["Guest"],
      };

      await userApi.create(newUser);
      set({ user: newUser, loading: false });
    });
  },
}));
