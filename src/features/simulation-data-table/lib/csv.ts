import type { AgentRow, NetworkRow, RoundRow, TableDataset } from "./table-datasets";

/**
 * CSV export per mockup: `;` separator, dot decimals (6 places for raw
 * values), UTF-8 BOM, quotes only when a field contains `;`, `"` or newline.
 */

function escapeField(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeField).join(";")];
  for (const row of rows) {
    lines.push(row.map(escapeField).join(";"));
  }
  return `\ufeff${lines.join("\n")}`;
}

/** Filename tokens use the mockup's stable Spanish dataset names. */
const DATASET_FILE_TOKEN: Record<TableDataset, string> = {
  agents: "agentes",
  rounds: "rondas",
  networks: "redes",
};

export function csvFileName(options: {
  runId: string;
  dataset: TableDataset;
  /** 1-based network ordinal; only included for multi-network runs. */
  networkOrdinal: number | null;
  /** Viewed round; only included for the agents dataset. */
  round: number | null;
}): string {
  const { runId, dataset, networkOrdinal, round } = options;
  let name = `silensess-${runId || "run"}`;
  if (networkOrdinal !== null) name += `-red${networkOrdinal}`;
  name += `-${DATASET_FILE_TOKEN[dataset]}`;
  if (dataset === "agents" && round !== null) name += `-ronda${round}`;
  return `${name}.csv`;
}

/** Labels the CSV needs from the UI layer (localized like the on-screen cells). */
export interface CsvLabels {
  strategy: (value: number) => string;
  effect: (value: number) => string;
  speaking: string;
  silent: string;
  consensus: string;
  noConsensus: string;
}

export function agentCsvRow(row: AgentRow, labels: CsvLabels): string[] {
  return [
    String(row.index),
    row.name ?? "",
    labels.strategy(row.strategy),
    labels.effect(row.effect),
    row.publicBelief.toFixed(6),
    row.privateBelief.toFixed(6),
    row.divergence.toFixed(6),
    row.speaking === null ? "" : row.speaking ? labels.speaking : labels.silent,
    String(row.degreeIn),
    String(row.degreeOut),
  ];
}

export function roundCsvRow(row: RoundRow): string[] {
  return [
    String(row.round),
    row.meanPublic.toFixed(6),
    row.meanPrivate.toFixed(6),
    row.spread.toFixed(6),
    row.participation.toFixed(6),
  ];
}

export function networkCsvRow(row: NetworkRow, labels: CsvLabels): string[] {
  return [
    String(row.ordinal),
    row.consensus === null ? "" : row.consensus ? labels.consensus : labels.noConsensus,
    row.finalRound === null ? "" : String(row.finalRound),
    row.finalSpread === null ? "" : row.finalSpread.toFixed(6),
  ];
}

/** Triggers a client-side download of the CSV content. */
export function downloadCsv(fileName: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 3000);
}
