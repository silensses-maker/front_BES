import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { useDeactivate } from "../model/use-deactivate";

export function DeactivateButton() {
  const { deactivate, loading } = useDeactivate();
  const { t } = useTranslation();

  const handleClick = () => {
    const confirmed = window.confirm(t("profile.deactivateConfirm"));
    if (confirmed) deactivate();
  };

  return (
    <Button variant="destructive" onClick={handleClick} disabled={loading}>
      {loading ? t("profile.deactivating") : t("profile.deactivateAccount")}
    </Button>
  );
}
