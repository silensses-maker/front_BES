import type { RoundAggregate } from "@/entities/simulation";
import type { ResultAgent, TopologyResponse } from "@/shared/api/backend";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";

export type TableDataset = "agents" | "rounds" | "networks";

export interface ColumnDef {
  /** i18n key under runView.* */
  labelKey: string;
  numeric: boolean;
}

export const DATASET_COLUMNS: Record<TableDataset, ColumnDef[]> = {
  agents: [
    { labelKey: "runView.colAgent", numeric: true },
    { labelKey: "runView.colName", numeric: false },
    { labelKey: "runView.colStrategy", numeric: false },
    { labelKey: "runView.colEffect", numeric: false },
    { labelKey: "runView.colPublic", numeric: true },
    { labelKey: "runView.colPrivate", numeric: true },
    { labelKey: "runView.colDivergence", numeric: true },
    { labelKey: "runView.colState", numeric: false },
    { labelKey: "runView.colDegreeIn", numeric: true },
    { labelKey: "runView.colDegreeOut", numeric: true },
  ],
  rounds: [
    { labelKey: "runView.colRound", numeric: true },
    { labelKey: "runView.colMeanPublic", numeric: true },
    { labelKey: "runView.colMeanPrivate", numeric: true },
    { labelKey: "runView.colSpread", numeric: true },
    { labelKey: "runView.colParticipation", numeric: true },
  ],
  networks: [
    { labelKey: "runView.colNetwork", numeric: true },
    { labelKey: "runView.colResult", numeric: false },
    { labelKey: "runView.colFinalRound", numeric: true },
    { labelKey: "runView.colFinalSpread", numeric: true },
  ],
};

// ─── Domain rows ──────────────────────────────────────────────────────────────

export interface AgentRow {
  index: number;
  name: string | null;
  strategy: number;
  effect: number;
  publicBelief: number;
  privateBelief: number;
  divergence: number;
  /** null in the limited viewer — /results has no speaking state. */
  speaking: boolean | null;
  degreeIn: number;
  degreeOut: number;
}

export interface RoundRow {
  round: number;
  meanPublic: number;
  meanPrivate: number;
  spread: number;
  participation: number;
}

export interface NetworkRow {
  /** 1-based ordinal, by listNetworks order. */
  ordinal: number;
  networkId: string;
  /** null while the network's result is still pending (202). */
  consensus: boolean | null;
  finalRound: number | null;
  /** Lazy: max−min of final beliefs when the page fetched them; null pending. */
  finalSpread: number | null;
}

// ─── Builders ─────────────────────────────────────────────────────────────────

export interface DegreeMap {
  inDegree: Map<number, number>;
  outDegree: Map<number, number>;
}

/** In/out degree per agent index, EXCLUDING self-loops (DeGroot self-weight). */
export function computeDegrees(topology: TopologyResponse): DegreeMap {
  const inDegree = new Map<number, number>();
  const outDegree = new Map<number, number>();
  for (const edge of topology.edges) {
    if (edge.source === edge.target) continue;
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }
  return { inDegree, outDegree };
}

/** Agent rows at the viewed round (frame) — the live/replay path. */
export function buildAgentRows(
  topology: TopologyResponse,
  frame: MergedFrame | null,
  degrees: DegreeMap,
): AgentRow[] {
  return topology.agents.map((agent) => {
    const publicBelief = frame?.publicBelief[agent.index] ?? agent.initialBelief;
    const privateBelief = frame?.privateBelief[agent.index] ?? agent.initialBelief;
    const speakingByte = frame?.speaking[agent.index];
    return {
      index: agent.index,
      name: agent.name,
      strategy: agent.silenceStrategy,
      effect: agent.silenceEffect,
      publicBelief,
      privateBelief,
      divergence: Math.abs(publicBelief - privateBelief),
      speaking: speakingByte === undefined ? null : speakingByte !== 0,
      degreeIn: degrees.inDegree.get(agent.index) ?? 0,
      degreeOut: degrees.outDegree.get(agent.index) ?? 0,
    };
  });
}

/** Agent rows from /results — the limited viewer (no per-round frames). */
export function buildAgentRowsFromResults(
  topology: TopologyResponse,
  resultAgents: ResultAgent[],
  degrees: DegreeMap,
): AgentRow[] {
  const byIndex = new Map(resultAgents.map((agent) => [agent.index, agent]));
  return topology.agents.map((agent) => {
    const result = byIndex.get(agent.index);
    const publicBelief = result?.publicBelief ?? agent.initialBelief;
    const privateBelief = result?.finalBelief ?? agent.initialBelief;
    return {
      index: agent.index,
      name: agent.name,
      strategy: agent.silenceStrategy,
      effect: agent.silenceEffect,
      publicBelief,
      privateBelief,
      divergence: Math.abs(publicBelief - privateBelief),
      speaking: null,
      degreeIn: degrees.inDegree.get(agent.index) ?? 0,
      degreeOut: degrees.outDegree.get(agent.index) ?? 0,
    };
  });
}

/** One row per DEFINED round of the aggregates buffer, up to `upTo`. */
export function buildRoundRows(
  aggregates: ReadonlyArray<RoundAggregate | undefined>,
  upTo: number,
): RoundRow[] {
  const rows: RoundRow[] = [];
  const limit = Math.min(upTo, aggregates.length - 1);
  for (let round = 0; round <= limit; round++) {
    const agg = aggregates[round];
    if (agg === undefined) continue;
    rows.push({
      round,
      meanPublic: agg.meanPublic,
      meanPrivate: agg.meanPrivate,
      spread: agg.spread,
      participation: agg.participation,
    });
  }
  return rows;
}

export interface NetworkConsensusInfo {
  status: "pending" | "consensus" | "no-consensus";
  finalRound: number | null;
}

export function buildNetworkRows(
  networkIds: string[],
  consensus: Record<string, NetworkConsensusInfo | undefined>,
  finalSpreads: Record<string, number | undefined>,
): NetworkRow[] {
  return networkIds.map((networkId, i) => {
    const entry = consensus[networkId];
    return {
      ordinal: i + 1,
      networkId,
      consensus:
        entry === undefined || entry.status === "pending" ? null : entry.status === "consensus",
      finalRound: entry?.finalRound ?? null,
      finalSpread: finalSpreads[networkId] ?? null,
    };
  });
}

/** max − min of final (private) beliefs — the per-network "dispersión final". */
export function computeFinalSpread(agents: ResultAgent[]): number | null {
  if (agents.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const agent of agents) {
    if (agent.finalBelief < min) min = agent.finalBelief;
    if (agent.finalBelief > max) max = agent.finalBelief;
  }
  return max - min;
}

// ─── Sort / filter ────────────────────────────────────────────────────────────

export type AgentFilter = "all" | "speaking" | "silent";
export type NetworkFilter = "all" | "consensus" | "no-consensus";

export function filterAgentRows(rows: AgentRow[], filter: AgentFilter): AgentRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) =>
    filter === "speaking" ? row.speaking === true : row.speaking === false,
  );
}

export function filterNetworkRows(rows: NetworkRow[], filter: NetworkFilter): NetworkRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) =>
    filter === "consensus" ? row.consensus === true : row.consensus === false,
  );
}

/** Per-column sort keys. Strategy/effect sort by enum value (mockup). */
export function agentSortKey(row: AgentRow, col: number): number | string {
  switch (col) {
    case 0:
      return row.index;
    case 1:
      return row.name ?? "";
    case 2:
      return row.strategy;
    case 3:
      return row.effect;
    case 4:
      return row.publicBelief;
    case 5:
      return row.privateBelief;
    case 6:
      return row.divergence;
    case 7:
      return row.speaking === null ? -1 : row.speaking ? 1 : 0;
    case 8:
      return row.degreeIn;
    default:
      return row.degreeOut;
  }
}

export function roundSortKey(row: RoundRow, col: number): number {
  switch (col) {
    case 0:
      return row.round;
    case 1:
      return row.meanPublic;
    case 2:
      return row.meanPrivate;
    case 3:
      return row.spread;
    default:
      return row.participation;
  }
}

export function networkSortKey(row: NetworkRow, col: number): number {
  switch (col) {
    case 0:
      return row.ordinal;
    case 1:
      return row.consensus === null ? -1 : row.consensus ? 1 : 0;
    case 2:
      return row.finalRound ?? -1;
    default:
      return row.finalSpread ?? -1;
  }
}

/** Stable sort by key with direction; strings compared lexicographically. */
export function sortRows<T>(
  rows: T[],
  keyFor: (row: T, col: number) => number | string,
  col: number,
  dir: "asc" | "desc",
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = keyFor(a, col);
    const kb = keyFor(b, col);
    if (ka > kb) return sign;
    if (ka < kb) return -sign;
    return 0;
  });
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PageWindow {
  /** Clamped page (0-based). */
  page: number;
  pages: number;
  /** Slice bounds into the filtered+sorted rows. */
  from: number;
  to: number;
}

export function paginate(totalRows: number, requestedPage: number, pageSize: number): PageWindow {
  const pages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Math.min(Math.max(0, requestedPage), pages - 1);
  const from = page * pageSize;
  const to = Math.min(totalRows, from + pageSize);
  return { page, pages, from, to };
}
