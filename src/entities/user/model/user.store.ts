import { onAuthStateChanged, signOut, type Unsubscribe } from "firebase/auth";
import { create } from "zustand";
import { usersApi } from "@/shared/api/backend";
import { auth } from "@/shared/api/firebase";
import { isAccountDeactivatedError } from "@/shared/lib/backend-error";
import { logger } from "@/shared/lib/logger";
import { type BackendAuthorization, toSessionUser } from "../api/user.mapper";
import type { User } from "../types/user.types";

/** Upper bound of the backend lookup on session restore, so a hung backend cannot hold it. */
const AUTHORIZATION_TIMEOUT_MS = 5000;

/**
 * Roles, quotas and `deactivated` from the backend (Postgres, the only source of authorization).
 * `"deactivated"` when the backend rejects the account as deactivated (it answers every REST call
 * of such an account with 401, this one included). `null` when it cannot be reached: the session
 * goes on with the Firebase identity and the role-table fallbacks.
 */
async function fetchAuthorization(
  uid: string,
): Promise<BackendAuthorization | "deactivated" | null> {
  try {
    return await usersApi.getInfo(uid, { timeout: AUTHORIZATION_TIMEOUT_MS });
  } catch (error) {
    if (isAccountDeactivatedError(error)) return "deactivated";
    logger.error("useAuthStore.observeAuthState", error);
    return null;
  }
}

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
    // A restore still awaiting the backend must not overwrite a later auth change (e.g. a
    // sign-out meanwhile).
    let latestChange = 0;

    return onAuthStateChanged(auth, async (firebaseUser) => {
      const change = ++latestChange;
      const isStale = () => change !== latestChange;

      if (!firebaseUser) {
        set({ user: null, loading: false });
        return;
      }

      // Identity (email, name, photo) is the Firebase user's; authorization is the backend's.
      const authorization = await fetchAuthorization(firebaseUser.uid);
      if (isStale()) return;

      if (authorization === "deactivated" || authorization?.deactivated) {
        await signOut(auth);
        set({ user: null, loading: false });
        return;
      }

      try {
        set({ user: toSessionUser(firebaseUser, authorization), loading: false });
      } catch (error) {
        // An unexpected backend payload must never leave the app stuck on `loading`: keep the
        // Firebase identity and the role-table fallbacks.
        logger.error("useAuthStore.observeAuthState", error);
        set({ user: toSessionUser(firebaseUser, null), loading: false });
      }
    });
  },
}));
