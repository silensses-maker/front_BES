import { logger } from "@/shared/lib/logger";

/**
 * Direct access to cosmos.gl for the per-round repaint (#142).
 *
 * Cosmograph 2.3.2 keeps its cosmos.gl 3.0.0-beta.8 `Graph` in the private field `_cosmos` (also
 * exposed as `_internalApi.cosmos`). Pushing the point colours and sizes there skips what a
 * `setConfig` with new `pointColorByFn` / `pointSizeByFn` costs on every round: the DuckDB-WASM
 * re-query of the point table, one callback and one CSS colour parse per point, and cosmos.gl's
 * `render()` (which also rebuilds the adjacency lists of every link).
 *
 * The push (`redraw: "create"`):
 * 1. `setPointColors` / `setPointSizes` store the arrays as cosmos.gl's input (RGBA 0–1, straight
 *    alpha; one size per point) and flag them dirty;
 * 2. `graph.updatePointColor()` / `graph.updatePointSize()` make them the drawn arrays — cosmos.gl
 *    keeps a reference to them, it does not copy;
 * 3. `create()` uploads the dirty buffers to the GPU. It does not touch the simulation (alpha,
 *    running state), so a running layout or clustering keeps running; the continuous frame loop
 *    draws the new colours on its next frame.
 * Without the `graph.update*` methods it falls back to `render(alpha)` (what Cosmograph itself
 * calls after a point update; it keeps the simulation state the same way Cosmograph does).
 *
 * Everything here is feature-detected; when something is missing or a push is not taken, the
 * canvas falls back to the `*ByFn` props for the rest of the session ({@link disableDirectRepaint}).
 */

/** The part of cosmos.gl's GraphData the push uses. */
interface CosmosGraphData {
  pointsNumber?: number;
  updatePointColor?: () => void;
  updatePointSize?: () => void;
}

/** The part of cosmos.gl's `Graph` the push uses. */
interface CosmosGraph {
  setPointColors: (colors: Float32Array) => void;
  setPointSizes: (sizes: Float32Array) => void;
  getPointColors: () => Float32Array;
  getPointSizes: () => Float32Array;
  create?: () => void;
  render?: (simulationAlpha?: number) => void;
  isSimulationRunning?: boolean;
  graph?: CosmosGraphData;
}

export type DirectRedraw = "create" | "render";

export interface CosmosDirect {
  /** How the pushed buffers are applied (see the module comment). */
  readonly redraw: DirectRedraw;
  /** Points cosmos.gl holds now (undefined before the data is uploaded). */
  pointCount(): number | undefined;
  /**
   * Pushes the colours (RGBA 0–1, 4 per point) and sizes (1 per point), in Cosmograph's point
   * order, and applies them. Throws when cosmos.gl did not take them.
   */
  push(colors: Float32Array, sizes: Float32Array): void;
  /** True while cosmos.gl draws exactly this colour array (nothing replaced it since the push). */
  holdsColors(colors: Float32Array): boolean;
  /** True while cosmos.gl draws exactly this size array. */
  holdsSizes(sizes: Float32Array): boolean;
  /** A copy of the colours cosmos.gl draws now (e.g. Cosmograph's own colouring). */
  copyColors(): Float32Array;
}

export type CosmosDirectResolution =
  | { status: "ready"; direct: CosmosDirect }
  /** No cosmos.gl instance yet (the graph data was never uploaded): try again later. */
  | { status: "not-ready" }
  | { status: "unsupported"; reason: string };

const REQUIRED_METHODS = ["setPointColors", "setPointSizes", "getPointColors", "getPointSizes"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The cosmos.gl Graph behind a Cosmograph instance: `_cosmos`, else `_internalApi.cosmos`. */
function cosmosOf(instance: Record<string, unknown>): unknown {
  if (instance._cosmos !== undefined) return instance._cosmos;
  const api = instance._internalApi;
  return isObject(api) ? api.cosmos : undefined;
}

function redrawOf(cosmos: Record<string, unknown>): DirectRedraw | null {
  const graph = cosmos.graph;
  if (
    typeof cosmos.create === "function" &&
    isObject(graph) &&
    typeof graph.updatePointColor === "function" &&
    typeof graph.updatePointSize === "function"
  ) {
    return "create";
  }
  return typeof cosmos.render === "function" ? "render" : null;
}

function createDirect(cosmos: CosmosGraph, redraw: DirectRedraw): CosmosDirect {
  return {
    redraw,
    pointCount: () => cosmos.graph?.pointsNumber,
    push(colors, sizes) {
      cosmos.setPointColors(colors);
      cosmos.setPointSizes(sizes);
      if (redraw === "create") {
        cosmos.graph?.updatePointColor?.();
        cosmos.graph?.updatePointSize?.();
        cosmos.create?.();
      } else {
        // Cosmograph's own call after a point update: keep the simulation as it is.
        cosmos.render?.(cosmos.isSimulationRunning ? undefined : 0);
      }
      // cosmos.gl draws the input arrays themselves when their length matches its point count;
      // anything else means it ignored them (wrong length, not ready, changed internals).
      if (cosmos.getPointColors() !== colors || cosmos.getPointSizes() !== sizes) {
        throw new Error("cosmos.gl did not take the pushed point buffers");
      }
    },
    holdsColors: (colors) => cosmos.getPointColors() === colors,
    holdsSizes: (sizes) => cosmos.getPointSizes() === sizes,
    copyColors: () => Float32Array.from(cosmos.getPointColors()),
  };
}

/**
 * Feature-detects the direct push on a Cosmograph instance. `not-ready` while no cosmos.gl
 * instance exists yet; `unsupported` (with the reason) when the internals differ from the ones
 * this was written against.
 */
export function resolveCosmosDirect(instance: unknown): CosmosDirectResolution {
  if (!isObject(instance)) return { status: "not-ready" };
  const cosmos = cosmosOf(instance);
  if (cosmos === undefined) return { status: "not-ready" };
  if (!isObject(cosmos)) return { status: "unsupported", reason: "no cosmos.gl instance" };
  const missing = REQUIRED_METHODS.filter((name) => typeof cosmos[name] !== "function");
  if (missing.length > 0) {
    return { status: "unsupported", reason: `cosmos.gl lacks ${missing.join(", ")}` };
  }
  const redraw = redrawOf(cosmos);
  if (redraw === null) return { status: "unsupported", reason: "cosmos.gl lacks create/render" };
  return { status: "ready", direct: createDirect(cosmos as unknown as CosmosGraph, redraw) };
}

// ─── Session fallback ─────────────────────────────────────────────────────────

let disabledReason: string | null = null;

/** True once the direct push failed in this session: the canvas uses the `*ByFn` props. */
export function isDirectRepaintDisabled(): boolean {
  return disabledReason !== null;
}

/** Switches the direct push off for the rest of the session; logs the first reason only. */
export function disableDirectRepaint(reason: unknown): void {
  if (disabledReason !== null) return;
  disabledReason = reason instanceof Error ? reason.message : String(reason);
  logger.error("SimulationCanvas.directRepaint (falling back to Cosmograph callbacks)", reason);
}

/** Test helper: re-enables the direct push. */
export function resetDirectRepaint(): void {
  disabledReason = null;
}
