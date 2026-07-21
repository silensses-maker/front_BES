import { getRoleLimits, useAuthStore } from "@/entities/user";
import { DeactivateButton } from "@/features/profile/deactivate-account";
import { EditNameForm } from "@/features/profile/edit-display-name";
import { useTranslation } from "@/shared/i18n";
import { useProfileSheetStore } from "@/shared/model/profile-sheet.store";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Progress } from "@/shared/ui/progress";
import { Separator } from "@/shared/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";

export function ProfileSheet() {
  const { t } = useTranslation();
  const isOpen = useProfileSheetStore((s) => s.isOpen);
  const close = useProfileSheetStore((s) => s.close);
  const user = useAuthStore((s) => s.user);

  const displayName = user?.name || t("dashboard.guestName");
  const initials = displayName.slice(0, 2).toUpperCase();
  const limits = user ? getRoleLimits(user.roles) : null;

  const isUnlimited = (value: number) => value === Infinity;

  const agentPercent =
    limits && !isUnlimited(limits.maxAgents) ? Math.min(100, (0 / limits.maxAgents) * 100) : 100;
  const iterationPercent =
    limits && !isUnlimited(limits.maxIterations)
      ? Math.min(100, (0 / limits.maxIterations) * 100)
      : 100;

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
        {user && limits && (
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

              {/* Agents */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("profile.agentsUsed")}</span>
                  <span className="text-sm font-mono font-medium">
                    {isUnlimited(limits.maxAgents) ? t("common.unlimited") : limits.maxAgents}
                  </span>
                </div>
                <Progress value={isUnlimited(limits.maxAgents) ? 100 : agentPercent} />
              </div>

              {/* Iterations */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("profile.iterationsUsed")}
                  </span>
                  <span className="text-sm font-mono font-medium">
                    {isUnlimited(limits.maxIterations)
                      ? t("common.unlimited")
                      : limits.maxIterations}
                  </span>
                </div>
                <Progress value={isUnlimited(limits.maxIterations) ? 100 : iterationPercent} />
              </div>

              {/* Density factor */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("profile.densityFactorLabel")}
                  </span>
                  <span className="text-sm font-mono font-medium">
                    {limits.densityFactor.toFixed(2)}
                  </span>
                </div>
                <Progress value={limits.densityFactor * 100} />
              </div>
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
