import { useAuthStore } from "@/entities/user";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/shared/ui/card";
import {
  buildAgentComposition,
  buildBiasComposition,
  type CompositionEntry,
  formatNumber,
  isOverQuota,
  listValidationMessages,
  quotaMeterPct,
} from "../lib/live-summary";
import { computeMaxEdges, validateCustomForm, validateGeneratedForm } from "../lib/validation";
import { useSimulationConfigStore } from "../model/simulation-config.store";

/** Cycling categorical palette — chart tokens instead of the mockup's raw hex. */
const CHART_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-1.5 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold">{value}</span>
    </div>
  );
}

function CompositionLegend({ entries }: { entries: CompositionEntry[] }) {
  const { t, i18n } = useTranslation();
  return (
    <div>
      {entries.map((entry, i) => (
        <div key={entry.labelKey} className="flex items-center gap-2 py-1 text-sm">
          <span
            className={cn(
              "size-[9px] shrink-0 rounded-sm",
              CHART_CLASSES[i % CHART_CLASSES.length],
            )}
            aria-hidden="true"
          />
          <span className="flex-1 text-muted-foreground">
            {t(entry.labelKey as Parameters<typeof t>[0])}
          </span>
          <span className="font-mono">{formatNumber(entry.count, i18n.language)}</span>
          <span className="w-11 text-right text-xs text-muted-foreground">{entry.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function QuotaMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const { t, i18n } = useTranslation();
  const over = isOverQuota(used, limit);
  const usedLabel = formatNumber(used, i18n.language);
  const caption =
    limit === null
      ? t("simulationConfig.liveQuotaUnlimited", { used: usedLabel })
      : t("simulationConfig.liveQuotaUsage", {
          used: usedLabel,
          limit: formatNumber(limit, i18n.language),
        });
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-xs">{caption}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-accent">
        <div
          className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
          style={{ width: `${quotaMeterPct(used, limit)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * "Resumen en vivo" — main-area companion of the wizard (mockup). Reads the
 * persisted config store directly (NOT useSimulationConfig — that would spawn
 * a second hook instance with its own navigation/toast deps) and recomputes
 * validation live on every change.
 */
export function SimulationLiveSummary() {
  const { t, i18n } = useTranslation();
  const networkType = useSimulationConfigStore((s) => s.networkType);
  const gen = useSimulationConfigStore((s) => s.generatedValues);
  const custom = useSimulationConfigStore((s) => s.customValues);
  const user = useAuthStore((s) => s.user);

  const maxAgents = user?.usageLimits?.maxAgents ?? null;
  const maxIterations = user?.usageLimits?.maxIterations ?? null;
  const role = user?.roles?.[0] ?? "—";

  const isCustom = networkType === "custom";
  const maxEdges = computeMaxEdges(gen.density, gen.numberOfAgents);
  const fmt = (n: number) => formatNumber(n, i18n.language);

  // Deliberate improvement over the mockup: meters read the ACTIVE slot
  const usedAgents = isCustom ? custom.agents.length : gen.numberOfAgents;
  const usedIterations = isCustom ? custom.iterationLimit : gen.iterationLimit;

  // Live validation — always visible (the panel's stated purpose)
  const errors = isCustom
    ? validateCustomForm(custom)
    : validateGeneratedForm(gen, maxAgents ?? undefined, maxIterations ?? undefined);
  const messages = listValidationMessages(errors, {
    requested: fmt(gen.agentTypes.reduce((sum, r) => sum + r.count, 0)),
    limit: maxAgents !== null ? fmt(maxAgents) : "∞",
    iterationLimit: maxIterations !== null ? fmt(maxIterations) : "∞",
    actual: fmt(gen.agentTypes.reduce((sum, r) => sum + r.count, 0)),
    expected: fmt(gen.numberOfAgents),
    bias: fmt(gen.biasTypes.reduce((sum, r) => sum + r.count, 0)),
    maxEdges: fmt(maxEdges),
  });

  const agentComposition = buildAgentComposition(gen);
  const biasComposition = buildBiasComposition(gen);

  const networkRows: Array<{ label: string; value: string }> = isCustom
    ? [
        { label: t("simulationConfig.customNetworkName"), value: custom.networkName || "—" },
        { label: t("simulationConfig.liveDefinedAgents"), value: String(custom.agents.length) },
        { label: t("simulationConfig.liveDefinedEdges"), value: String(custom.edges.length) },
        { label: t("simulationConfig.iterationLimit"), value: fmt(custom.iterationLimit) },
        { label: t("simulationConfig.stopThreshold"), value: String(custom.stopThreshold) },
      ]
    : [
        { label: t("simulationConfig.numberOfAgents"), value: fmt(gen.numberOfAgents) },
        { label: t("simulationConfig.numberOfNetworks"), value: String(gen.numberOfNetworks) },
        { label: t("simulationConfig.density"), value: String(gen.density) },
        { label: t("simulationConfig.liveEdgesBarabasi"), value: fmt(maxEdges) },
        { label: t("simulationConfig.iterationLimit"), value: fmt(gen.iterationLimit) },
        { label: t("simulationConfig.stopThreshold"), value: String(gen.stopThreshold) },
        {
          label: t("simulationConfig.seed"),
          value: gen.seed === null ? t("simulationConfig.seedRandom") : String(gen.seed),
        },
      ];

  return (
    <div className="mx-auto w-full max-w-[920px]">
      <h1 className="font-display text-[26px] text-foreground">
        {t("simulationConfig.liveSummaryTitle")}
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">
        {t("simulationConfig.liveSummarySubtitle")}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Red ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5">
            <Eyebrow>{t("simulationConfig.liveCardNetwork")}</Eyebrow>
            {networkRows.map((row) => (
              <SummaryRow key={row.label} label={row.label} value={row.value} />
            ))}
          </CardContent>
        </Card>

        {/* ── Composición ─────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5">
            <Eyebrow>{t("simulationConfig.liveCardComposition")}</Eyebrow>
            <div className="mb-2.5 flex h-2.5 overflow-hidden rounded-full bg-accent">
              {agentComposition.map((entry, i) => (
                <div
                  key={entry.labelKey}
                  className={cn("h-full", CHART_CLASSES[i % CHART_CLASSES.length])}
                  style={{ width: `${entry.pct}%` }}
                />
              ))}
            </div>
            <CompositionLegend entries={agentComposition} />
            <div className="mt-4">
              <Eyebrow>{t("simulationConfig.liveBiasOnEdges")}</Eyebrow>
              <CompositionLegend entries={biasComposition} />
            </div>
          </CardContent>
        </Card>

        {/* ── Cuota ───────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5">
            <Eyebrow>{t("simulationConfig.liveCardQuota", { role })}</Eyebrow>
            <QuotaMeter
              label={t("simulationConfig.liveMeterAgents")}
              used={usedAgents}
              limit={maxAgents}
            />
            <QuotaMeter
              label={t("simulationConfig.liveMeterIterations")}
              used={usedIterations}
              limit={maxIterations}
            />
          </CardContent>
        </Card>

        {/* ── Validación ──────────────────────────────────── */}
        <Card>
          <CardContent className="pt-5">
            <Eyebrow>{t("simulationConfig.liveCardValidation")}</Eyebrow>
            {messages.length === 0 ? (
              <p className="text-sm font-medium text-ok">{t("simulationConfig.reviewValid")}</p>
            ) : (
              <div>
                {messages.map(({ key, params }) => (
                  <p key={key} className="py-0.5 text-xs text-destructive">
                    • {t(key as Parameters<typeof t>[0], params)}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
