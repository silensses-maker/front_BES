import type { CosmographDataPrepConfig } from "@cosmograph/react";
import type { TopologyResponse } from "@/shared/api/backend";

/**
 * Plain JS arrays + dataPrepConfig ready to hand directly to
 * `prepareCosmographData(dataPrepConfig, rawPoints, rawLinks)`.
 *
 * Keeping this as a pure function (no DuckDB, no React) makes it trivially
 * unit-testable and side-effect-free.
 */
export interface PreparedDataInput {
  /** Plain JS array of point objects, ready for prepareCosmographData. */
  rawPoints: Record<string, unknown>[];
  /** Plain JS array of link objects, ready for prepareCosmographData. */
  rawLinks: Record<string, unknown>[];
  /** dataPrepConfig argument for prepareCosmographData. */
  dataPrepConfig: CosmographDataPrepConfig;
}

/**
 * Converts a `TopologyResponse` into the three structures needed to call
 * `prepareCosmographData`.
 *
 * Point `id` is `String(agent.index)` — stable string key used as
 * `pointIdBy` and matched by link `source` / `target`.
 *
 * The `dataPrepConfig` declares `pointIncludeColumns` for all fields that
 * downstream features (#49 charts, #51 inspector, #99 toggle) will need to
 * read back from the prepared Arrow table.
 */
export function topologyToData(topology: TopologyResponse): PreparedDataInput {
  const hasNames = topology.agents.some((agent) => agent.name != null);

  const selfLoopSet = new Set(
    topology.edges.filter((e) => e.source === e.target).map((e) => e.source),
  );

  const rawPoints: Record<string, unknown>[] = topology.agents.map((agent) => ({
    id: String(agent.index),
    // Numeric agent index kept as a column so the Final view's pointColorByFn /
    // pointSizeByFn (#99) can read the frame buffers by index. Cosmograph passes
    // the column *value* to the accessor reliably (the optional 2nd `index` arg
    // is not), so the lookup key must live in the data, not the callback index.
    agentIndex: agent.index,
    initialBelief: agent.initialBelief,
    speaking: 0,
    silenceStrategy: agent.silenceStrategy,
    silenceEffect: agent.silenceEffect,
    selfLoop: selfLoopSet.has(agent.index) ? 1 : 0,
    ...(hasNames ? { name: agent.name ?? null } : {}),
  }));

  const rawLinks: Record<string, unknown>[] = topology.edges.map((edge) => ({
    source: String(edge.source),
    target: String(edge.target),
    influence: edge.influence,
    bias: edge.bias,
  }));

  // Cosmograph DataKit drops columns that are all-null and emits a warning.
  // Only declare `name` in the schema when at least one agent has a non-null name.
  const pointIncludeColumns = [
    "agentIndex",
    "initialBelief",
    "silenceStrategy",
    "silenceEffect",
    "selfLoop",
    ...(hasNames ? ["name"] : []),
  ];

  const dataPrepConfig: CosmographDataPrepConfig = {
    points: {
      pointIdBy: "id",
      pointColorBy: "initialBelief",
      pointIncludeColumns,
    },
    links: {
      linkSourceBy: "source",
      linkTargetsBy: ["target"],
      linkIncludeColumns: ["influence", "bias"],
    },
  };

  return { rawPoints, rawLinks, dataPrepConfig };
}
