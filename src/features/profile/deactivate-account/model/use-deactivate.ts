import { signOut } from "firebase/auth";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthStore, userApi } from "@/entities/user";
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
      await userApi.update(user.uid, { deactivated: true });
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
