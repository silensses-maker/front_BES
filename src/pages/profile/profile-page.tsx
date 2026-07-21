import { useAuthStore, usePermissions } from "@/entities/user";
import { LanguageSwitcher } from "@/features/language-switch";
import { DeactivateButton, EditNameForm } from "@/features/profile";
import { useTranslation } from "@/shared/i18n";

export function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const { roles, limits } = usePermissions();
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-lg space-y-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("profile.title")}</h1>
        <LanguageSwitcher />
      </div>

      <section className="space-y-1">
        <h2 className="text-sm font-medium text-muted-foreground">{t("profile.accountInfo")}</h2>
        <p className="text-sm">
          <span className="font-medium">{t("profile.email")}:</span> {user?.email}
        </p>
        <p className="text-sm">
          <span className="font-medium">{t("profile.role")}:</span> {roles.join(", ")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("profile.usageLimits")}</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>{t("profile.maxAgents")}</span>
          <span>{limits.maxAgents === Infinity ? t("common.unlimited") : limits.maxAgents}</span>
          <span>{t("profile.maxIterations")}</span>
          <span>
            {limits.maxIterations === Infinity ? t("common.unlimited") : limits.maxIterations}
          </span>
          <span>{t("profile.densityFactor")}</span>
          <span>{limits.densityFactor}</span>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("profile.editDisplayName")}
        </h2>
        <EditNameForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("profile.dangerZone")}</h2>
        <DeactivateButton />
      </section>
    </div>
  );
}
