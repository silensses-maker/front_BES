import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { useAuthStore } from "@/entities/user";
import { auth } from "@/shared/api/firebase";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";

export function useLogout() {
  const { t } = useTranslation();
  const setUser = useAuthStore((state) => state.setUser);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      logger.error("useLogout", error);
      toast.error(t("dashboard.errorSignOut"));
    }
  };

  return { logout };
}
