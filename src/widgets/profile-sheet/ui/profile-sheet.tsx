import { resolveUsageLimits, useAuthStore } from "@/entities/user";
import { DeactivateButton } from "@/features/profile/deactivate-account";
import { EditNameForm } from "@/features/profile/edit-display-name";
import { useTranslation } from "@/shared/i18n";
import { useProfileSheetStore } from "@/shared/model/profile-sheet.store";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Separator } from "@/shared/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";

export function ProfileSheet() {
  const { t } = useTranslation();
  const isOpen = useProfileSheetStore((s) => s.isOpen);
  const close = useProfileSheetStore((s) => s.close);
  const user = useAuthStore((s) => s.user);

  const displayName = user?.name || t("dashboard.guestName");
  const initials = displayName.slice(0, 2).toUpperCase();
  // The quotas the wizard validates against. They are caps per run, not an allowance that runs
  // out with use, so they read as plain values (no usage meter).
  const limits = user ? resolveUsageLimits(user) : null;
  const formatCap = (value: number) => (value === Infinity ? t("common.unlimited") : String(value));
  const limitRows = limits
    ? [
        { key: "agents", label: t("profile.agentsUsed"), value: formatCap(limits.maxAgents) },
        {
          key: "iterations",
          label: t("profile.iterationsUsed"),
          value: formatCap(limits.maxIterations),
        },
        { key: "networks", label: t("profile.networksUsed"), value: formatCap(limits.maxNetworks) },
        {
          key: "density",
          label: t("profile.densityFactorLabel"),
          value: limits.densityFactor.toFixed(2),
        },
      ]
    : [];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto flex flex-col gap-0">
        <SheetHeader className="pb-4">
          <SheetTitle>{t("profile.title")}</SheetTitle>
          <SheetDescription>{t("profile.sheetDescription")}</SheetDescription>
        </SheetHeader>

        {/* ── Profile header ──────────────────────────────── */}
        <section className="flex items-center gap-4 px-4 py-4">
          <Avatar className="h-16 w-16 shrink-0">
            {user?.photo && <AvatarImage src={user.photo} alt={displayName} />}
            <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-base font-semibold leading-tight truncate">{displayName}</span>
            {user?.email && (
              <span className="text-sm text-muted-foreground truncate">{user.email}</span>
            )}
            {user?.roles && user.roles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {user.roles.map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium"
                  >
                    {role}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* ── Edit display name ───────────────────────────── */}
        <section className="px-4 py-4 flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t("profile.editDisplayName")}</h3>
          <EditNameForm />
        </section>

        <Separator />

        {/* ── Usage limits ────────────────────────────────── */}
        {limits && (
          <>
            <section className="px-4 py-4 flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("profile.usageLimits")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {t("profile.usageLimitsDescription")}
                </p>
              </div>

              <dl className="flex flex-col gap-2">
                {limitRows.map((row) => (
                  <div key={row.key} className="flex items-center justify-between">
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="text-sm font-mono font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <Separator />
          </>
        )}

        {/* ── Danger zone ─────────────────────────────────── */}
        {user && (
          <section className="px-4 py-4 flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold text-destructive">{t("profile.dangerZone")}</h3>
              <p className="text-xs text-muted-foreground">{t("profile.deactivateDescription")}</p>
            </div>
            <DeactivateButton />
          </section>
        )}
      </SheetContent>
    </Sheet>
  );
}
