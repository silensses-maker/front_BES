import { updateProfile } from "firebase/auth";
import { useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/entities/user";
import { auth } from "@/shared/api/firebase";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";

/** Width of the backend's `users.name` (VARCHAR(255), migration 002), which mirrors the name. */
export const DISPLAY_NAME_MAX_LENGTH = 255;

export function useEditName() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [loading, setLoading] = useState(false);

  const editName = async (newName: string) => {
    const name = newName.trim();
    if (!user || !name || name.length > DISPLAY_NAME_MAX_LENGTH) return;
    setLoading(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error("No signed-in Firebase user");
      // The display name lives in Firebase Authentication (identity source).
      await updateProfile(firebaseUser, { displayName: name });
      try {
        // The backend mirrors the name from the ID token on each request: a fresh token makes
        // it pick up the new name now. Not fatal: the name is saved and the mirror catches up
        // at the next token refresh.
        await firebaseUser.getIdToken(true);
      } catch (error) {
        logger.error("useEditName", error);
      }
      setUser({ ...user, name });
      toast.success(t("profile.successEditName"));
    } catch (error) {
      logger.error("useEditName", error);
      toast.error(t("profile.errorEditName"));
    } finally {
      setLoading(false);
    }
  };

  return { editName, currentName: user?.name ?? "", loading };
}
