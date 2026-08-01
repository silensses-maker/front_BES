import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import {
  agentCsvRow,
  buildCsv,
  type CsvLabels,
  csvFileName,
  downloadCsv,
  networkCsvRow,
  roundCsvRow,
} from "../lib/csv";
import type { AgentFilter, NetworkFilter, TableDataset } from "../lib/table-datasets";
import type { PageSize, UseDataTableReturn } from "../model/use-data-table";

interface DataTablePanelProps {
  table: UseDataTableReturn;
  runId: string;
  /** 1-based ordinal of the current network (multi-net runs); null otherwise. */
  networkOrdinal: number | null;
  viewedRound: number;
  selectedAgentIndex: number | null;
  currentNetworkId: string | null;
  onSelectAgent: (index: number) => void;
  onSeekRound: (round: number) => void;
  onSelectNetwork: (networkId: string) => void;
}

const DATASET_LABEL_KEY: Record<TableDataset, string> = {
  agents: "runView.datasetAgents",
  rounds: "runView.datasetRounds",
  networks: "runView.datasetNetworks",
};

/**
 * "Tabla de datos" (mockup): dataset selector, filter pills, sortable sticky
 * header, pagination footer and CSV export of the current filtered+sorted set.
 * Dumb component — all cross-feature wiring (seek, canvas selection, network
 * navigation) comes in via callbacks from the page layer.
 */
export function DataTablePanel({
  table,
  runId,
  networkOrdinal,
  viewedRound,
  selectedAgentIndex,
  currentNetworkId,
  onSelectAgent,
  onSeekRound,
  onSelectNetwork,
}: DataTablePanelProps) {
  const { t, i18n } = useTranslation();
  const fmt = (n: number) => formatNumber(n, i18n.language);

  const strategyLabel = (value: number): string => {
    const map: Record<number, string> = {
      0: t("enums.silenceStrategy.degroot"),
      1: t("enums.silenceStrategy.majority"),
      2: t("enums.silenceStrategy.threshold"),
      3: t("enums.silenceStrategy.confidence"),
    };
    return map[value] ?? String(value);
  };
  const effectLabel = (value: number): string => {
    const map: Record<number, string> = {
      0: t("enums.silenceEffect.degroot"),
      1: t("enums.silenceEffect.memory"),
      2: t("enums.silenceEffect.memoryless"),
    };
    return map[value] ?? String(value);
  };

  const csvLabels: CsvLabels = {
    strategy: strategyLabel,
    effect: effectLabel,
    speaking: t("runView.speaking"),
    silent: t("runView.silent"),
    consensus: t("runView.consensus"),
    noConsensus: t("runView.noConsensus"),
  };

  const exportCsv = () => {
    const headers = table.columns.map((col) => t(col.labelKey as Parameters<typeof t>[0]));
    const rows =
      table.dataset === "agents"
        ? table.filteredAgentRows.map((row) => agentCsvRow(row, csvLabels))
        : table.dataset === "rounds"
          ? table.filteredRoundRows.map(roundCsvRow)
          : table.filteredNetworkRows.map((row) => networkCsvRow(row, csvLabels));
    const fileName = csvFileName({
      runId,
      dataset: table.dataset,
      networkOrdinal,
      round: table.dataset === "agents" ? viewedRound : null,
    });
    downloadCsv(fileName, buildCsv(headers, rows));
    toast.success(
      t("runView.csvToast", { count: rows.length, display: fmt(rows.length), file: fileName }),
    );
  };

  const filters: Array<{ value: AgentFilter | NetworkFilter; label: string }> =
    table.dataset === "agents"
      ? [
          { value: "all", label: t("runView.filterAll") },
          { value: "speaking", label: t("runView.speaking") },
          { value: "silent", label: t("runView.silent") },
        ]
      : table.dataset === "networks"
        ? [
            { value: "all", label: t("runView.filterAllNetworks") },
            { value: "consensus", label: t("runView.consensus") },
            { value: "no-consensus", label: t("runView.noConsensus") },
          ]
        : [];

  return (
    <div className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* ── Toolbar ───────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-center gap-2.5 border-b border-border px-3 py-[9px]">
        <span className="flex gap-0.5 rounded-lg border border-border bg-muted p-0.5">
          {table.availableDatasets.map((dataset) => (
            <button
              key={dataset}
              type="button"
              onClick={() => table.setDataset(dataset)}
              className={cn(
                "h-6 rounded-md px-2.5 font-sans text-[11.5px] font-medium",
                table.dataset === dataset
                  ? "bg-accent font-semibold text-primary"
                  : "text-muted-foreground",
              )}
            >
              {t(DATASET_LABEL_KEY[dataset] as Parameters<typeof t>[0])}
            </button>
          ))}
        </span>
        {filters.length > 0 && (
          <span className="flex gap-1.5">
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => table.setFilter(option.value)}
                className={cn(
                  "h-[25px] rounded-full border px-[11px] font-sans text-[11.5px] font-medium",
                  table.filter === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </span>
        )}
        <span className="min-w-2 flex-1" />
        <span className="font-sans text-[11.5px] text-muted-foreground">
          {t("runView.rowCount", {
            count: table.filteredCount,
            display: fmt(table.filteredCount),
          })}
          {table.filter !== "all" && ` ${t("runView.filteredSuffix")}`}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="outline" size="xs" className="h-7" onClick={exportCsv}>
              {t("runView.exportCsv")}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {t("runView.csvTooltip", { rows: fmt(table.filteredCount) })}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ── Table ─────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="text-[12.5px]">
          <TableHeader>
            <TableRow>
              {table.columns.map((col, i) => (
                <TableHead
                  key={col.labelKey}
                  aria-sort={
                    table.sortCol === i
                      ? table.sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={cn(
                    "sticky top-0 z-[2] cursor-pointer select-none whitespace-nowrap bg-muted px-2.5 font-sans text-[11px] font-semibold uppercase tracking-[.04em]",
                    col.numeric && "text-right",
                    table.sortCol === i ? "text-foreground" : "text-muted-foreground",
                  )}
                  onClick={() => table.toggleSort(i)}
                  aria-label={t("runView.colSortAria", {
                    column: t(col.labelKey as Parameters<typeof t>[0]),
                  })}
                >
                  {t(col.labelKey as Parameters<typeof t>[0])}
                  {table.sortCol === i && (table.sortDir === "asc" ? " ↑" : " ↓")}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.dataset === "agents" &&
              table.pageAgentRows.map((row) => (
                <TableRow
                  key={row.index}
                  className={cn("cursor-pointer", selectedAgentIndex === row.index && "bg-accent")}
                  onClick={() => onSelectAgent(row.index)}
                >
                  <NumCell>{t("runView.agentLabel", { index: row.index })}</NumCell>
                  <TextCell>{row.name ?? "—"}</TextCell>
                  <TextCell>{strategyLabel(row.strategy)}</TextCell>
                  <TextCell>{effectLabel(row.effect)}</TextCell>
                  <NumCell>{row.publicBelief.toFixed(4)}</NumCell>
                  <NumCell>{row.privateBelief.toFixed(4)}</NumCell>
                  <NumCell>{row.divergence.toFixed(4)}</NumCell>
                  <TextCell>
                    {row.speaking === null
                      ? "—"
                      : row.speaking
                        ? t("runView.speaking")
                        : t("runView.silent")}
                  </TextCell>
                  <NumCell>{String(row.degreeIn)}</NumCell>
                  <NumCell>{String(row.degreeOut)}</NumCell>
                </TableRow>
              ))}
            {table.dataset === "rounds" &&
              table.pageRoundRows.map((row) => (
                <TableRow
                  key={row.round}
                  className={cn("cursor-pointer", viewedRound === row.round && "bg-accent")}
                  onClick={() => onSeekRound(row.round)}
                >
                  <NumCell>{fmt(row.round)}</NumCell>
                  <NumCell>{row.meanPublic.toFixed(4)}</NumCell>
                  <NumCell>{row.meanPrivate.toFixed(4)}</NumCell>
                  <NumCell>{row.spread.toFixed(4)}</NumCell>
                  <NumCell>{`${(row.participation * 100).toFixed(1)} %`}</NumCell>
                </TableRow>
              ))}
            {table.dataset === "networks" &&
              table.pageNetworkRows.map((row) => (
                <TableRow
                  key={row.networkId}
                  className={cn(
                    "cursor-pointer",
                    currentNetworkId === row.networkId && "bg-accent",
                  )}
                  onClick={() => onSelectNetwork(row.networkId)}
                >
                  <NumCell>{fmt(row.ordinal)}</NumCell>
                  <TextCell>
                    {row.consensus === null
                      ? "—"
                      : row.consensus
                        ? t("runView.consensus")
                        : t("runView.noConsensus")}
                  </TextCell>
                  <NumCell>{row.finalRound === null ? "—" : fmt(row.finalRound)}</NumCell>
                  <NumCell>{row.finalSpread === null ? "—" : row.finalSpread.toFixed(4)}</NumCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        {table.filteredCount === 0 && (
          <p className="p-6 text-center font-sans text-[12.5px] text-muted-foreground">
            {t("runView.emptyFiltered")}
          </p>
        )}
      </div>

      {/* ── Pagination footer ─────────────────────────────── */}
      <div className="flex flex-none items-center gap-[9px] border-t border-border px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={t("runView.firstPageAria")}
          disabled={table.window.page === 0}
          onClick={() => table.goToPage(0)}
        >
          <SkipBack />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={t("runView.prevPageAria")}
          disabled={table.window.page === 0}
          onClick={() => table.goToPage(table.window.page - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="font-mono text-xs font-medium">
          {t("runView.pageLabel", {
            page: fmt(table.window.page + 1),
            pages: fmt(table.window.pages),
          })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={t("runView.nextPageAria")}
          disabled={table.window.page >= table.window.pages - 1}
          onClick={() => table.goToPage(table.window.page + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={t("runView.lastPageAria")}
          disabled={table.window.page >= table.window.pages - 1}
          onClick={() => table.goToPage(table.window.pages - 1)}
        >
          <SkipForward />
        </Button>
        <span className="font-sans text-[11.5px] text-muted-foreground">
          {table.filteredCount === 0
            ? t("runView.rangeEmpty")
            : t("runView.rangeLabel", {
                from: fmt(table.window.from + 1),
                to: fmt(table.window.to),
              })}
        </span>
        <span className="flex-1" />
        <span className="font-sans text-[11.5px] text-muted-foreground">
          {t("runView.rowsPerPage")}
        </span>
        <Select
          value={String(table.pageSize)}
          onValueChange={(value) => table.setPageSize(Number(value) as PageSize)}
        >
          <SelectTrigger size="sm" className="h-7 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function NumCell({ children }: { children: React.ReactNode }) {
  return (
    <TableCell className="whitespace-nowrap px-2.5 text-right font-mono">{children}</TableCell>
  );
}

function TextCell({ children }: { children: React.ReactNode }) {
  return <TableCell className="whitespace-nowrap px-2.5">{children}</TableCell>;
}
