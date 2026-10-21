import type { AgentRow, NetworkRow, RoundRow, TableDataset } from "./table-datasets";

/**
 * CSV export per mockup: the data table's rows and file name. The file conventions (`;`
 * separator, UTF-8 BOM, quotes only when a field contains `;`, `"` or newline) and the download
 * live in `@/shared/lib/csv`; raw values here use dot decimals, 6 places.
 */

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
