import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  adjacentNetwork,
  buildNetworkEntries,
  consensusSummary,
  filterNetworkEntries,
  type NetworkBrowserEntry,
  type NetworkBrowserFilter,
} from "./network-browser-lib";
import type { NetworkConsensusEntry } from "./use-network-consensus";

/** Mockup thresholds: card list up to 24 networks, numeric search above 12. */
const LIST_MODE_MAX = 24;
const SEARCH_MIN = 12;
/** Heat-map render cap (mockup: first 2 000 filtered cells). */
const GRID_CELL_CAP = 2_000;

interface NetworkBrowserProps {
  runId: string;
  networkIds: string[];
  /** Currently open network; null in the selector state (none chosen yet). */
  currentNetworkId: string | null;
  consensus: Record<string, NetworkConsensusEntry | undefined>;
  finalSpreads: Record<string, number>;
  /** Asks the owner to lazily fetch dispersions for the visible list. */
  onVisibleNetworks?: (networkIds: string[]) => void;
  agentCount: number | null;
  /** selector → true (mockup abre la lista); run view → false (selectRed la cierra). */
  defaultOpen: boolean;
}

function statusBadgeClass(status: NetworkConsensusEntry["status"]): string {
  if (status === "consensus") return "bg-ok/15 text-ok";
  if (status === "no-consensus") return "bg-warn/15 text-warn";
  return "bg-muted text-muted-foreground";
}

/**
 * "Redes (N)" browser (mockup, run sidebar): consensus summary, filter pills,
 * card list (≤24) or heat-map grid (>24), numeric go-to search, and the
 * "Viendo" bar with prev/next through the filtered list. Dumb component —
 * consensus data and the dispersion cache come in via props (single owner
 * per context avoids double polling).
 */
export function NetworkBrowser({
  runId,
  networkIds,
  currentNetworkId,
  consensus,
  finalSpreads,
  onVisibleNetworks,
  agentCount,
  defaultOpen,
}: NetworkBrowserProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fmt = (n: number) => formatNumber(n, i18n.language);

  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState<NetworkBrowserFilter>("all");
  const [search, setSearch] = useState("");

  const entries = useMemo(
    () => buildNetworkEntries(networkIds, consensus),
    [networkIds, consensus],
  );
  const summary = useMemo(() => consensusSummary(entries), [entries]);
  const filtered = useMemo(
    () => filterNetworkEntries(entries, filter, search),
    [entries, filter, search],
  );

  const gridMode = entries.length > LIST_MODE_MAX;
  const current =
    currentNetworkId !== null
      ? (entries.find((e) => e.networkId === currentNetworkId) ?? null)
      : null;
  const currentPos =
    current !== null ? filtered.findIndex((e) => e.networkId === current.networkId) : -1;

  const openNetwork = (networkId: string) => {
    navigate(`/board/simulation/${runId}/${networkId}`);
  };

  const goAdjacent = (dir: 1 | -1) => {
    if (current === null) return;
    const neighbor = adjacentNetwork(filtered, current.networkId, dir);
    if (neighbor === null) {
      toast.warning(dir < 0 ? t("runView.firstNetworkToast") : t("runView.lastNetworkToast"));
      return;
    }
    openNetwork(neighbor.networkId);
  };

  // Lazy dispersions for the visible card list (grid cells never fetch)
  useEffect(() => {
    if (!open || gridMode || onVisibleNetworks === undefined) return;
    const resolved = filtered
      .filter((e) => e.status !== "pending" && finalSpreads[e.networkId] === undefined)
      .map((e) => e.networkId);
    if (resolved.length > 0) onVisibleNetworks(resolved);
  }, [open, gridMode, filtered, finalSpreads, onVisibleNetworks]);

  const statusLabel = (status: NetworkConsensusEntry["status"]): string =>
    status === "consensus"
      ? t("runView.consensus")
      : status === "no-consensus"
        ? t("runView.noConsensus")
        : t("runView.networkPending");

  const cardMeta = (entry: NetworkBrowserEntry): string => {
    const parts: string[] = [];
    if (agentCount !== null)
      parts.push(t("runView.networkMetaAgents", { display: fmt(agentCount) }));
    if (entry.finalRound !== null) {
      parts.push(t("runView.networkMetaFinished", { round: fmt(entry.finalRound) }));
    }
    const spread = finalSpreads[entry.networkId];
    if (spread !== undefined) {
      parts.push(t("runView.networkMetaSpread", { spread: spread.toFixed(3) }));
    }
    return parts.join(" · ");
  };

  const gridTooltip = (entry: NetworkBrowserEntry): string => {
    const parts = [
      t("runView.networkOrdinal", { n: fmt(entry.ordinal) }),
      statusLabel(entry.status),
    ];
    const spread = finalSpreads[entry.networkId];
    if (spread !== undefined) {
      parts.push(t("runView.networkMetaSpread", { spread: spread.toFixed(3) }));
    }
    return parts.join(" · ");
  };

  const filters: Array<{ value: NetworkBrowserFilter; label: string; count: number }> = [
    { value: "all", label: t("runView.filterAllNetworks"), count: summary.total },
    { value: "consensus", label: t("runView.consensus"), count: summary.consensus },
    { value: "no-consensus", label: t("runView.noConsensus"), count: summary.noConsensus },
  ];

  const gridCells = gridMode ? filtered.slice(0, GRID_CELL_CAP) : [];

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("runView.networksHeader", { count: fmt(entries.length) })}
        </span>
        {(!open || current !== null) && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-6 rounded-[7px]"
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? t("runView.networksToggleHide") : t("runView.networksToggleShow")}
          </Button>
        )}
      </div>

      {/* ── "Viendo" bar ────────────────────────────────────── */}
      {current !== null && (
        <div className="mb-2 flex items-center gap-2 rounded-[9px] bg-accent px-2.5 py-[7px]">
          <span className="flex-none font-sans text-[11px] text-muted-foreground">
            {t("runView.networksViewing")}
          </span>
          <span className="flex-none font-sans text-sm font-semibold">
            {t("runView.networkOrdinal", { n: fmt(current.ordinal) })}
          </span>
          <span
            className={cn(
              "flex-none rounded-[5px] px-[7px] py-px font-sans text-[10.5px] font-medium",
              statusBadgeClass(current.status),
            )}
          >
            {statusLabel(current.status)}
          </span>
          <span className="flex-1" />
          {currentPos >= 0 && (
            <span className="flex-none font-mono text-[11px] text-muted-foreground">
              {t("runView.networksPosition", {
                pos: fmt(currentPos + 1),
                total: fmt(filtered.length),
              })}
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={t("runView.prevNetworkAria")}
                onClick={() => goAdjacent(-1)}
              >
                ‹
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("runView.prevNetworkTip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={t("runView.nextNetworkAria")}
                onClick={() => goAdjacent(1)}
              >
                ›
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t("runView.nextNetworkTip")}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* ── Open block ──────────────────────────────────────── */}
      {open && (
        <>
          {/* Summary card */}
          <div className="mb-2.5 rounded-[10px] border border-border bg-card px-3 py-[11px]">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="font-sans text-[12.5px] font-semibold">
                {t("runView.networksSummary", {
                  n: fmt(summary.consensus),
                  m: fmt(summary.total),
                })}
              </span>
              <span className="font-mono text-[13px] font-semibold text-ok">{summary.pct} %</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-[3px] bg-warn/30">
              <div className="h-full rounded-[3px] bg-ok" style={{ width: `${summary.pct}%` }} />
            </div>
            <div className="mt-[7px] flex gap-3 font-sans text-[11px] text-muted-foreground">
              <span className="flex items-center gap-[5px]">
                <span className="size-2 rounded-[2px] bg-ok" aria-hidden="true" />
                {t("runView.consensus")}
              </span>
              <span className="flex items-center gap-[5px]">
                <span className="size-2 rounded-[2px] bg-warn/60" aria-hidden="true" />
                {t("runView.noConsensus")}
              </span>
            </div>
          </div>

          {/* Filter pills + visible count */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={cn(
                  "h-[25px] rounded-full border px-[11px] font-sans text-[11.5px] font-medium",
                  filter === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {option.label} · {fmt(option.count)}
              </button>
            ))}
            <span className="ml-auto font-sans text-[11px] text-muted-foreground">
              {t("runView.networksVisible", {
                count: filtered.length,
                display: fmt(filtered.length),
              })}
              {filtered.length !== entries.length &&
                ` ${t("runView.networksFilteredFrom", { total: fmt(entries.length) })}`}
            </span>
          </div>

          {/* Numeric go-to search (large runs) */}
          {entries.length > SEARCH_MIN && (
            <Input
              type="text"
              placeholder={t("runView.networksSearchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2 h-[30px] px-2.5 text-xs"
            />
          )}

          {/* Filtered-empty state */}
          {filtered.length === 0 && (
            <p className="rounded-[10px] border border-dashed border-border p-4 text-center font-sans text-xs text-muted-foreground">
              {t("runView.networksEmpty")}
            </p>
          )}

          {/* Card list (≤ 24 networks) */}
          {!gridMode && filtered.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {filtered.map((entry) => (
                <button
                  key={entry.networkId}
                  type="button"
                  onClick={() => openNetwork(entry.networkId)}
                  className={cn(
                    "rounded-[9px] border bg-card px-[11px] py-[9px] text-left",
                    entry.networkId === currentNetworkId ? "border-primary" : "border-border",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-sans text-[12.5px] font-semibold">
                      {t("runView.networkOrdinal", { n: fmt(entry.ordinal) })}
                    </span>
                    <span
                      className={cn(
                        "flex-none rounded-[5px] px-[7px] py-px font-sans text-[10.5px] font-medium",
                        statusBadgeClass(entry.status),
                      )}
                    >
                      {statusLabel(entry.status)}
                    </span>
                  </span>
                  {cardMeta(entry) !== "" && (
                    <span className="mt-[3px] block font-sans text-[11.5px] text-muted-foreground">
                      {cardMeta(entry)}
                    </span>
                  )}
                  <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
                    …{entry.networkId.slice(-8)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Heat-map grid (> 24 networks) */}
          {gridMode && filtered.length > 0 && (
            <>
              <div className="flex max-h-[230px] flex-wrap gap-[3px] overflow-y-auto px-px py-0.5">
                {gridCells.map((entry) => (
                  <Tooltip key={entry.networkId}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={gridTooltip(entry)}
                        onClick={() => openNetwork(entry.networkId)}
                        className={cn(
                          "size-[15px] flex-none cursor-pointer rounded-[3px]",
                          entry.status === "consensus"
                            ? "bg-ok/55"
                            : entry.status === "no-consensus"
                              ? "bg-warn/55"
                              : "bg-muted-foreground/25",
                          entry.networkId === currentNetworkId &&
                            "outline outline-2 outline-offset-1 outline-foreground",
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">{gridTooltip(entry)}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              {filtered.length > GRID_CELL_CAP && (
                <p className="mt-1.5 font-sans text-[11px] text-muted-foreground">
                  {t("runView.networksGridTrunc", {
                    shown: fmt(GRID_CELL_CAP),
                    total: fmt(filtered.length),
                  })}
                </p>
              )}
              <p className="mt-1.5 font-sans text-[11px] text-muted-foreground">
                {t("runView.networksGridHint")}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
