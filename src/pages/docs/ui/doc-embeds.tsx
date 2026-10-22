import type { ReactNode } from "react";
import { ROLE_LIMITS, type UserRole } from "@/entities/user";
// polarization (#129): remove with src/shared/lib/polarization + src/features/run-polarization
import { LineSample, MAX_SERIES, slotStyle } from "@/features/run-polarization";
import { useTranslation } from "@/shared/i18n";
import { DIVERGENCE_PALETTE, OPINION_PALETTE } from "@/shared/lib/opinion-palette";
import { useChartTheme } from "@/shared/lib/use-chart-theme";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

/**
 * Pieces of the real interface the manual shows in place of a screenshot: the platform's own
 * components, labels (i18n keys, so always in the language being read) and data (role quotas,
 * palettes). They are previews: nothing in them can be clicked or focused (`inert`).
 */

/** A label of the interface quoted in the text ("click <Ui>Next</Ui>"). */
export function Ui({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

/** A framed, non-interactive preview of interface elements, with a caption. */
export function UiPreview({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <figure
      aria-label={t("docs.previewLabel", { what: label })}
      className="my-2 flex flex-col gap-2 rounded-xl border border-border bg-card p-4"
    >
      <div inert className="flex flex-wrap items-center gap-3">
        {children}
      </div>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

type ButtonVariant = "default" | "outline" | "destructive" | "ghost" | "link";

/** A real button of the interface, by its i18n key, shown non-interactive. */
export function UiButton({ k, variant = "outline" }: { k: string; variant?: ButtonVariant }) {
  const { t } = useTranslation();
  return (
    <span inert className="inline-flex align-middle">
      <Button type="button" size="sm" variant={variant}>
        {t(k)}
      </Button>
    </span>
  );
}

/** Lowest to highest — the order the quotas grow in `ROLE_LIMITS` (as in the FAQ). */
const QUOTA_ROLES: UserRole[] = ["Guest", "BaseUser", "Researcher", "Administrator"];

/** The role quotas the platform applies, read from the same table the wizard validates with. */
export function RoleQuotasTable() {
  const { t, i18n } = useTranslation();
  const format = (value: number) =>
    Number.isFinite(value) ? value.toLocaleString(i18n.language) : t("common.unlimited");

  return (
    <div className="my-2 max-w-2xl overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("faq.quotasColRole")}</TableHead>
            <TableHead className="text-right">{t("faq.quotasColAgents")}</TableHead>
            <TableHead className="text-right">{t("faq.quotasColIterations")}</TableHead>
            <TableHead className="text-right">{t("faq.quotasColNetworks")}</TableHead>
            <TableHead className="text-right">{t("profile.densityFactor")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {QUOTA_ROLES.map((role) => {
            const limits = ROLE_LIMITS[role];
            return (
              <TableRow key={role}>
                <TableCell className="font-medium text-foreground">{role}</TableCell>
                <TableCell className="text-right font-mono">{format(limits.maxAgents)}</TableCell>
                <TableCell className="text-right font-mono">
                  {format(limits.maxIterations)}
                </TableCell>
                <TableCell className="text-right font-mono">{format(limits.maxNetworks)}</TableCell>
                <TableCell className="text-right font-mono">
                  {limits.densityFactor.toFixed(2)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** The history's status badges, same variants as the experiment list. */
const RUN_STATUSES = [
  { key: "simulationHistory.statusRunning", variant: "default" },
  { key: "simulationHistory.statusCompleted", variant: "secondary" },
  { key: "simulationHistory.statusCancelled", variant: "outline" },
  { key: "simulationHistory.statusError", variant: "destructive" },
] as const;

export function RunStatusBadges({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <UiPreview label={label}>
      {RUN_STATUSES.map(({ key, variant }) => (
        <Badge key={key} variant={variant}>
          {t(key)}
        </Badge>
      ))}
    </UiPreview>
  );
}

/**
 * polarization (#129): text of the manual that only applies when the build has the Polarization
 * view (the charts section's paragraph on its tab); a flag-off build renders nothing in its place.
 */
export function WithPolarization({ children }: { children: ReactNode }) {
  return __POLARIZATION__ ? <>{children}</> : null;
}

/**
 * polarization (#129): the colour and line style of the ten comparable polarization series, drawn
 * with the chart's own line sample and palette (they follow the theme).
 */
export function PolarizationLineStyles() {
  const theme = useChartTheme();
  const slots = Array.from({ length: MAX_SERIES }, (_, slot) => slot);
  return (
    <div
      inert
      className="my-2 grid max-w-xl grid-cols-5 gap-2 rounded-xl border border-border bg-card p-4"
    >
      {slots.map((slot) => {
        const { colorIndex, dash } = slotStyle(slot);
        return (
          <span
            key={slot}
            data-dash={dash}
            className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
          >
            <LineSample color={theme.series[colorIndex] ?? theme.text} dash={dash} />
            {slot + 1}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The graph's floating legend as "Colorear por" draws it (mirrors simulation-canvas's
 * canvas-legend.tsx, whose public API also loads the graph engine): the colour scale of the
 * selected mode, the self-influence square and the speaking / silent sizes.
 */
export function CanvasLegendPreview({ mode = "belief" }: { mode?: "belief" | "divergence" }) {
  const { t } = useTranslation();
  const divergence = mode === "divergence";
  const gradient = `linear-gradient(to right, ${(divergence ? DIVERGENCE_PALETTE : OPINION_PALETTE).join(", ")})`;
  return (
    <div inert className="my-2 w-48 rounded-lg border border-border bg-card/90 p-2.5 shadow-sm">
      <span className="font-sans text-[11px] text-muted-foreground">
        {divergence ? t("runView.colorDivergence") : t("runView.colorPublic")}
      </span>
      <div className="mt-1.5 flex flex-col gap-1.5">
        <div>
          <div className="h-2 w-full rounded-sm" style={{ background: gradient }} />
          <div className="mt-0.5 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>0</span>
            <span>{divergence ? "≥ 0.2" : "1"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-border pt-1.5">
          <span className="inline-block size-2.5 shrink-0 rounded-[2px] bg-muted-foreground" />
          <span className="font-sans text-[11px] text-muted-foreground">
            {t("runView.legendSelfLoop")}
          </span>
        </div>
        <div className="flex flex-col gap-1 border-t border-border pt-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-block size-3.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="font-sans text-[11px] text-muted-foreground">
              {t("simulation.canvas.legendSpeaking")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground opacity-60" />
            <span className="font-sans text-[11px] text-muted-foreground">
              {t("simulation.canvas.legendSilent")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The timeline's event marker colours (same tokens as timeline-panel.tsx). */
const EVENT_KINDS = [
  { key: "runView.eventLegendChange", dot: "bg-primary" },
  { key: "runView.eventLegendSilence", dot: "bg-warn" },
  { key: "runView.eventLegendEnd", dot: "bg-ok" },
] as const;

export function TimelineEventLegend() {
  const { t } = useTranslation();
  return (
    <span
      inert
      className="my-1 inline-flex flex-wrap gap-3 rounded-lg border border-border bg-card px-3 py-2"
    >
      {EVENT_KINDS.map(({ key, dot }) => (
        <span
          key={key}
          className="flex items-center gap-1.5 font-sans text-xs text-muted-foreground"
        >
          <span className={cn("size-2 flex-none rounded-[2px]", dot)} />
          {t(key)}
        </span>
      ))}
    </span>
  );
}
