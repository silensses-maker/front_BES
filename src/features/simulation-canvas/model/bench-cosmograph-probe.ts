import type { CosmographRef } from "@cosmograph/react";
import { type BenchProbeDetail, benchProbe } from "@/shared/lib/bench-probe";

/**
 * Benchmark builds only (#126): forwards Cosmograph 2.3's own events to the bench probe and times
 * its `setConfig` calls. Only `useBenchCanvasProbe` imports this module, and SimulationCanvas
 * calls that hook inside `if (__BENCHMARK__)`, so normal builds drop it.
 *
 * Cosmograph dispatches its lifecycle on an internal EventTarget, reachable through the
 * instance's internal API object (`instance._internalApi`, the same object
 * `getInternalApi(instance)` of `@cosmograph/cosmograph/cosmograph/internal.d.ts` returns; read
 * from the instance so that no module import is left behind in normal builds):
 * - `graphRebuilt` — the graph data is uploaded and `cosmos.render()` was called;
 * - `clustersUpdated` — new cluster assignments were applied;
 * - `onSimulationStart` / `onSimulationTick` / `onSimulationEnd` — the force simulation, ticked
 *   once per rendered frame while it runs;
 * - `pointColorUpdated` — Cosmograph recomputed and uploaded the colours itself: per round only on
 *   the fallback repaint path (#142); the direct path pushes the buffers to cosmos.gl without it
 *   and reports `canvas-repaint` from the canvas instead.
 */

type CosmographInstance = NonNullable<CosmographRef>;

/** The part of Cosmograph 2.3's internal API the probe uses. */
interface CosmographInternalApi {
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  cosmosElement?: HTMLElement;
}

function internalApi(instance: CosmographInstance): CosmographInternalApi | undefined {
  const api = (instance as unknown as { _internalApi?: CosmographInternalApi })._internalApi;
  return api && typeof api.addEventListener === "function" ? api : undefined;
}

/** The renderer of the WebGL context Cosmograph draws with (the GPU the browser actually used). */
export function readCosmographRenderer(instance: CosmographInstance | undefined): string | null {
  if (!instance) return null;
  try {
    const canvas = internalApi(instance)?.cosmosElement?.querySelector("canvas");
    // getContext() of an existing context type returns that same context
    const gl = (canvas?.getContext("webgl2") ?? canvas?.getContext("webgl")) as
      | WebGL2RenderingContext
      | WebGLRenderingContext
      | null
      | undefined;
    if (!gl) return null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const value = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export interface CosmographProbe {
  /** setConfig calls still in flight (the harness waits for 0 before it unmounts the canvas). */
  pending(): number;
  /** Detaches the listeners and restores setConfig. */
  detach(): void;
}

/** Starts forwarding Cosmograph's events and timing its setConfig calls. */
export function attachCosmographProbe(
  instance: CosmographInstance,
  detail: BenchProbeDetail,
): CosmographProbe {
  const api = internalApi(instance);
  // The first tick after a (re)start, a rebuild or a cluster update is the first frame drawn
  // with the new data: that is where the layout windows of the suite start.
  let awaitingTick = true;
  const handlers: Array<[string, () => void]> = [
    [
      "graphRebuilt",
      () => {
        awaitingTick = true;
        benchProbe("cosmograph-graph-rebuilt", detail);
      },
    ],
    [
      "clustersUpdated",
      () => {
        awaitingTick = true;
        benchProbe("cosmograph-clusters-updated", detail);
      },
    ],
    [
      "onSimulationStart",
      () => {
        awaitingTick = true;
        benchProbe("cosmograph-simulation-start", detail);
      },
    ],
    [
      "onSimulationTick",
      () => {
        if (!awaitingTick) return;
        awaitingTick = false;
        benchProbe("cosmograph-first-tick", detail);
      },
    ],
    ["onSimulationEnd", () => benchProbe("cosmograph-simulation-end", detail)],
    ["pointColorUpdated", () => benchProbe("cosmograph-colors-updated", detail)],
  ];
  if (api) for (const [type, handler] of handlers) api.addEventListener(type, handler);

  // Every prop change of <Cosmograph> becomes one setConfig call. On the fallback repaint path
  // (#142) that is the per-round update (point table re-query, colour/size recomputation, buffer
  // upload); on the direct path the props stay static during playback.
  const original = instance.setConfig;
  let inFlight = 0;
  instance.setConfig = function timedSetConfig(this: CosmographInstance, config) {
    const start = performance.now();
    inFlight++;
    const promise = original.call(this, config);
    const syncMs = performance.now() - start;
    promise.then(
      () => {
        inFlight--;
        benchProbe("cosmograph-config-done", {
          ...detail,
          durationMs: performance.now() - start,
          syncMs,
        });
      },
      () => {
        inFlight--;
      },
    );
    return promise;
  };

  return {
    pending: () => inFlight,
    detach: () => {
      if (api) for (const [type, handler] of handlers) api.removeEventListener(type, handler);
      instance.setConfig = original;
    },
  };
}
