import type { UsageLimits } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { numberLocale } from "../lib/admin-users.lib";

/** One quota value: a localized number, or ∞ (titled "Unlimited") for the contract's `null`. */
function Quota({ value, locale }: { value: number | null | undefined; locale: string }) {
  const { t } = useTranslation();
  if (value === null || value === undefined) {
    return (
      <span title={t("common.unlimited")} aria-label={t("common.unlimited")}>
        ∞
      </span>
    );
  }
  return <span>{value.toLocaleString(locale)}</span>;
}

/** Compact `agents · iterations · networks · density` of a role's quotas. */
export function QuotaSummary({ limits }: { limits: UsageLimits }) {
  const { t, i18n } = useTranslation();
  const locale = numberLocale(i18n.language);
  return (
    <span className="font-mono text-xs text-foreground" title={t("adminUsers.quotasHint")}>
      <Quota value={limits.maxAgents} locale={locale} /> ·{" "}
      <Quota value={limits.maxIterations} locale={locale} /> ·{" "}
      <Quota value={limits.maxNetworks} locale={locale} /> · ×{limits.densityFactor.toFixed(2)}
    </span>
  );
}
