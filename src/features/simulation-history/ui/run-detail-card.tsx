import { Download, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

interface RunDetailCardProps {
  run: RunSummary;
  /**
   * Exports the configuration the run was launched with (runId + seed, #127). Only
   * provided for the run whose launch configuration this browser kept; no button otherwise.
   */
  onExportConfig?: () => void;
  /**
   * Opens the wizard pre-filled with this GENERATED run's stored configuration (#127). Not
   * provided for custom runs, which show how to re-launch them from their exported file instead.
   */
  onRelaunch?: () => void;
  /** True while the run's configuration is being fetched. */
  relaunching?: boolean;
}

const STATUS_BADGE_VARIANT: Record<
  RunSummary["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  running: "default",
  completed: "secondary",
  error: "destructive",
  cancelled: "outline",
};

const STATUS_LABEL_KEY = {
  running: "simulationHistory.statusRunning",
  completed: "simulationHistory.statusCompleted",
  error: "simulationHistory.statusError",
  cancelled: "simulationHistory.statusCancelled",
} as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RunDetailCard({
  run,
  onExportConfig,
  onRelaunch,
  relaunching = false,
}: RunDetailCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const displayName = run.name ?? t("simulationHistory.runNameFallback");

  const rows: Array<{ label: string; value: string | number; mono?: boolean }> = [
    {
      label: t("simulationHistory.runType"),
      value:
        run.type === "generated"
          ? t("simulationHistory.runTypeGenerated")
          : t("simulationHistory.runTypeCustom"),
    },
    { label: t("simulationHistory.runNetworks"), value: run.networkCount },
    {
      label: t("simulationHistory.runIterations"),
      value: run.iterationLimit.toLocaleString(i18n.language),
    },
    { label: t("simulationHistory.runCreated"), value: formatDate(run.createdAt) },
    // Seed of a generated run (#127): exact digits of the 64-bit column
    ...(typeof run.seed === "string"
      ? [{ label: t("simulationHistory.runSeed"), value: run.seed, mono: true }]
      : []),
  ];

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* ── Title row ──────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-sans text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("simulationHistory.runDetailTitle")}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              {/* Mockup uses the display serif for the experiment name */}
              <h2 className="truncate font-display text-xl text-foreground">{displayName}</h2>
              <Badge variant={STATUS_BADGE_VARIANT[run.status]} className="shrink-0">
                {t(STATUS_LABEL_KEY[run.status])}
              </Badge>
            </div>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="shrink-0 font-mono">
                {run.id.slice(0, 8)}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">
                {t("simulationHistory.fullIdTooltip")}: <span className="font-mono">{run.id}</span>
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator />

        {/* ── Metadata rows ──────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {rows.map(({ label, value, mono }) => (
            <div key={label}>
              <dt className="font-sans text-xs text-muted-foreground">{label}</dt>
              <dd
                className={
                  mono
                    ? "break-all font-mono text-sm font-medium text-foreground"
                    : "font-sans text-sm font-medium text-foreground"
                }
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {/* ── Action (footnote goes BELOW it, per mockup) ── */}
        <Button
          type="button"
          className="w-full"
          onClick={() => navigate(`/board/simulation/${run.id}`)}
        >
          {t("simulationHistory.openLiveRun")}
        </Button>

        {run.type === "generated" && onRelaunch !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={relaunching}
                onClick={onRelaunch}
              >
                <RotateCcw aria-hidden="true" />
                {relaunching ? t("common.loading") : t("simulationHistory.relaunch")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72">
              <p className="text-xs">{t("simulationHistory.relaunchTip")}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {run.type === "custom" && (
          <p className="font-sans text-xs text-muted-foreground">
            {t("simulationHistory.relaunchCustomHint")}
          </p>
        )}

        {onExportConfig !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" className="w-full" onClick={onExportConfig}>
                <Download aria-hidden="true" />
                {t("simulationHistory.exportConfig")}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-72">
              <p className="text-xs">{t("simulationHistory.exportConfigTip")}</p>
            </TooltipContent>
          </Tooltip>
        )}

        <p className="text-center font-sans text-xs text-muted-foreground">
          {t("simulationHistory.retentionNote")}
        </p>
      </CardContent>
    </Card>
  );
}
