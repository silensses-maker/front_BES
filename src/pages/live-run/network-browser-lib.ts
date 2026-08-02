import type { NetworkConsensusEntry } from "./use-network-consensus";

export type NetworkBrowserFilter = "all" | "consensus" | "no-consensus";

export interface NetworkBrowserEntry {
  /** 1-based ordinal, by listNetworks order. */
  ordinal: number;
  networkId: string;
  status: NetworkConsensusEntry["status"];
  finalRound: number | null;
}

/** Joins listNetworks order with the consensus map into browser entries. */
export function buildNetworkEntries(
  networkIds: string[],
  consensus: Record<string, NetworkConsensusEntry | undefined>,
): NetworkBrowserEntry[] {
  return networkIds.map((networkId, i) => ({
    ordinal: i + 1,
    networkId,
    status: consensus[networkId]?.status ?? "pending",
    finalRound: consensus[networkId]?.finalRound ?? null,
  }));
}

/**
 * Mockup filter: by verdict (pending networks only show under "Todas") plus
 * the numeric-PREFIX search on the 1-based ordinal ("1" matches 1, 10-19,
 * 100…). Non-digit characters in the query are stripped.
 */
export function filterNetworkEntries(
  entries: NetworkBrowserEntry[],
  filter: NetworkBrowserFilter,
  search: string,
): NetworkBrowserEntry[] {
  const prefix = search.trim().replace(/[^0-9]/g, "");
  return entries.filter((entry) => {
    if (filter === "consensus" && entry.status !== "consensus") return false;
    if (filter === "no-consensus" && entry.status !== "no-consensus") return false;
    if (prefix && String(entry.ordinal).indexOf(prefix) !== 0) return false;
    return true;
  });
}

export interface ConsensusSummary {
  consensus: number;
  noConsensus: number;
  pending: number;
  total: number;
  /** Over the TOTAL (mockup), not over the resolved subset. */
  pct: number;
}

export function consensusSummary(entries: NetworkBrowserEntry[]): ConsensusSummary {
  let consensus = 0;
  let noConsensus = 0;
  for (const entry of entries) {
    if (entry.status === "consensus") consensus++;
    else if (entry.status === "no-consensus") noConsensus++;
  }
  const total = entries.length;
  return {
    consensus,
    noConsensus,
    pending: total - consensus - noConsensus,
    total,
    pct: total > 0 ? Math.round((consensus / total) * 100) : 0,
  };
}

/** Neighbor of `currentId` within the FILTERED list; null at the edges. */
export function adjacentNetwork(
  filtered: NetworkBrowserEntry[],
  currentId: string,
  dir: 1 | -1,
): NetworkBrowserEntry | null {
  const pos = filtered.findIndex((entry) => entry.networkId === currentId);
  if (pos === -1) return null;
  return filtered[pos + dir] ?? null;
}
