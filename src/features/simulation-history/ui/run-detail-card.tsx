import { useNavigate } from "react-router-dom";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";

interface RunDetailCardProps {
  run: RunSummary;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function RunDetailCard({ run }: RunDetailCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const displayName = run.name ?? t("simulationHistory.runNameFallback");

  const rows: Array<{ label: string; value: string | number }> = [
    {
      label: t("simulationHistory.runType"),
      value:
        run.type === "generated"
          ? t("simulationHistory.runTypeGenerated")
          : t("simulationHistory.runTypeCustom"),
    },
    { label: t("simulationHistory.runNetworks"), value: run.networkCount },
    { label: t("simulationHistory.runIterations"), value: run.iterationLimit },
    { label: t("simulationHistory.runCreated"), value: formatDate(run.createdAt) },
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
            <h2 className="mt-0.5 truncate font-sans text-base font-semibold text-foreground">
              {displayName}
            </h2>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {run.id.slice(0, 8)}
          </Badge>
        </div>

        <Separator />

        {/* ── Metadata rows ──────────────────────────────── */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {rows.map(({ label, value }) => (
            <div key={label}>
              <dt className="font-sans text-xs text-muted-foreground">{label}</dt>
              <dd className="font-sans text-sm font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>

        <Separator />

        {/* ── Action ─────────────────────────────────────── */}
        <Button
          type="button"
          className="w-full"
          onClick={() => navigate(`/board/simulation/${run.id}`)}
        >
          {t("simulationHistory.openLiveRun")}
        </Button>
      </CardContent>
    </Card>
  );
}
