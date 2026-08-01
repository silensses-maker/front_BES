import type { TopologyAgent } from "@/shared/api/backend";

export interface CompositionEntry {
  /** Enum value (SilenceStrategy or SilenceEffect). */
  value: number;
  count: number;
  /** Share of the total, 0..100 (one decimal). */
  pct: number;
}

/**
 * Groups topology agents by strategy or effect for the sidebar "Composición"
 * card (stacked bar + legend). Sorted by enum value; empty groups omitted.
 */
export function compositionBy(
  agents: TopologyAgent[],
  field: "silenceStrategy" | "silenceEffect",
): CompositionEntry[] {
  const counts = new Map<number, number>();
  for (const agent of agents) {
    const value = agent[field];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const total = agents.length || 1;
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({
      value,
      count,
      pct: Math.round((count / total) * 1000) / 10,
    }));
}
