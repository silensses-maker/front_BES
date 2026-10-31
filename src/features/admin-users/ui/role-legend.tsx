import type { RoleCatalogEntry } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { roleLabel } from "@/shared/i18n/enum-labels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { QuotaSummary } from "./quota-summary";

/** What each role grants per run, highest role first. */
export function RoleLegend({ catalog }: { catalog: RoleCatalogEntry[] }) {
  const { t } = useTranslation();
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="font-sans text-sm font-semibold">
          {t("adminUsers.legendTitle")}
        </CardTitle>
        <CardDescription className="text-xs">{t("adminUsers.legendDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <dl className="flex flex-col gap-1.5">
          {catalog.map((entry) => (
            <div key={entry.role} className="flex items-center justify-between gap-4">
              <dt className="text-sm text-foreground">{roleLabel(t, entry.role)}</dt>
              <dd>
                <QuotaSummary limits={entry.usageLimits} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{t("adminUsers.quotasHint")}</p>
      </CardContent>
    </Card>
  );
}
