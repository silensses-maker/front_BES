import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { useLogin } from "../model/use-login";

export function LoginButton() {
  const { login, loading } = useLogin();
  const { t } = useTranslation();

  return (
    <Button onClick={login} disabled={loading}>
      {loading ? t("auth.signingIn") : t("auth.signInGoogle")}
    </Button>
  );
}
