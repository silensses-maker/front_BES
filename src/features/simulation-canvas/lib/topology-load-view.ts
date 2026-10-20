import type { TopologyLoadStatus } from "@/entities/simulation";

/**
 * What the canvas area shows for the topology load (#128) while no topology is on screen:
 * - `failed`: the download failed as a whole — error state with a retry action (a partial
 *   topology is never shown);
 * - `downloading`: pages downloaded so far (`pagesTotal` null until the first page gave the
 *   counts), with the share done when known;
 * - `assembling`: every page arrived, the topology is being assembled ("Preparing…", like the
 *   canvas's own data preparation that follows);
 * - null: nothing to show from the load — the canvas falls back to its own states.
 */
export type TopologyLoadView =
  | { kind: "failed" }
  | { kind: "downloading"; pagesDone: number; pagesTotal: number | null; percent: number | null }
  | { kind: "assembling" }
  | null;

export function topologyLoadView(
  status: TopologyLoadStatus | undefined,
  hasTopology: boolean,
): TopologyLoadView {
  if (hasTopology || status === undefined) return null;
  if (status.phase === "failed") return { kind: "failed" };
  if (status.phase !== "loading") return null;
  const { progress } = status;
  if (progress === null) {
    return { kind: "downloading", pagesDone: 0, pagesTotal: null, percent: null };
  }
  if (progress.stage === "assemble") return { kind: "assembling" };
  const { pagesDone, pagesTotal } = progress;
  const percent =
    pagesTotal === null || pagesTotal <= 0
      ? null
      : Math.min(100, Math.round((100 * pagesDone) / pagesTotal));
  return { kind: "downloading", pagesDone, pagesTotal, percent };
}
