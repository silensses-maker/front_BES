import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { useLogout } from "../model/use-logout";

export function LogoutButton() {
  const { logout } = useLogout();
  const { t } = useTranslation();

  return <Button onClick={logout}>{t("auth.signOut")}</Button>;
}
