import { useTranslation } from "@/shared/i18n";

/**
 * Suspense fallback shown while a lazily loaded page chunk is in flight.
 * Fills the content area of its shell (landing or dashboard), so the header
 * and navigation stay visible; same spinner markup as the canvas "loading
 * network" state. `role="status"` announces the text politely.
 */
export function RouteFallback() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="flex min-h-[60vh] w-full flex-1 items-center justify-center gap-2"
    >
      <div
        aria-hidden="true"
        className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />
      <p className="font-sans text-sm text-muted-foreground">{t("routeBoundary.loading")}</p>
    </div>
  );
}
