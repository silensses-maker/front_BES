import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { toast } from "sonner";
import { toSessionUser, useAuthStore } from "@/entities/user";
import { usersApi } from "@/shared/api/backend";
import { auth } from "@/shared/api/firebase";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";

const provider = new GoogleAuthProvider();

export function useLogin() {
  const { t } = useTranslation();
  const loading = useAuthStore((state) => state.loading);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setUser = useAuthStore((state) => state.setUser);

  const login = async () => {
    setLoading(true);
    try {
      // Identity (email, name, photo): the Firebase user.
      const { user: firebaseUser } = await signInWithPopup(auth, provider);
      // auth.currentUser is set synchronously by Firebase before the promise
      // resolves, so the auth interceptor on backendClient will find a valid
      // currentUser when it calls getIdToken() for the Authorization header.
      // Authorization (roles, quotas): the backend, which creates the account on first login.
      const authorization = await usersApi.sync();
      setUser(toSessionUser(firebaseUser, authorization));
    } catch (error) {
      logger.error("useLogin", error);
      toast.error(t("auth.errorLogin"));
    } finally {
      setLoading(false);
    }
  };

  return { login, loading };
}
