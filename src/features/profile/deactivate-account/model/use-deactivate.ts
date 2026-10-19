import { signOut } from "firebase/auth";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/entities/user";
import { usersApi } from "@/shared/api/backend";
import { auth } from "@/shared/api/firebase";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";

export function useDeactivate() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [loading, setLoading] = useState(false);

  const deactivate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // The backend (Postgres) owns `deactivated`: from now on it rejects the account's REST
      // calls (401), and the session restore signs it out on its next sign-in.
      await usersApi.deactivateMe();
      await signOut(auth);
      // store clears via observeAuthState
    } catch (error) {
      logger.error("useDeactivate", error);
      toast.error(t("profile.errorDeactivate"));
      setLoading(false);
    }
  };

  return { deactivate, loading };
}
