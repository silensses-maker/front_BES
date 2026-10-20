import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TopologyResponse } from "@/shared/api/backend";
import { cn } from "@/shared/lib/utils";
import { currentBuildInfo } from "../lib/build-info";
import { downloadText } from "../lib/download";
import {
  type BenchEnvironment,
  collectEnvironment,
  environmentLabel,
  measureUaMemory,
} from "../lib/environment";
import {
  createFrameRecorder,
  longTasksSupported,
  observeBrowserLongTasks,
  readBrowserHeap,
} from "../lib/frame-recorder";
import { estimateGpuMemory } from "../lib/gpu-estimate";
import { buildHudRecordDocument, buildHudSnapshot, type HudNetwork } from "../lib/hud-document";
import { deriveLoadTimings, type ResourceEntryLite } from "../lib/load-timings";
import { toPhaseResult } from "../lib/phase-result";
import { sampleRefreshInterval } from "../lib/refresh-rate";
import { resultToCsv } from "../lib/result-csv";
import {
  BENCH_HARNESS_MARKER,
  type BenchResultDocument,
  type LoadTimings,
  resultFileStem,
} from "../lib/result-schema";
import { browserRuntime } from "../lib/runtime";
import { inferDensity } from "../lib/synthetic-topology";
import { useLiveFrameStats } from "../model/use-live-frame-stats";
import { useProbeEvents } from "../model/use-probe-events";
import "./bench.css";

/**
 * Debug HUD of the run view (#126) — benchmark builds on a loopback host only (the run view
 * guards both). Developer tool: English only, never shipped to users.
 *
 * Shows live FPS (current, median and p5 over 5 s), slow/dropped frames, JS heap, the network
 * size and its load timings, and the environment; "Copy metrics" puts a JSON snapshot on the
 * clipboard and "Record 10 s" measures one phase with the same statistics as the /bench suite.
 * Toggle: the HUD button or Shift+H. The live readout re-renders the HUD 4×/s (a small cost);
 * it pauses while recording.
 */

const RECORD_MS = 10_000;
const OPEN_KEY = "silensess.benchHud.open";
const MB = 1024 * 1024;

const fmtFps = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : v.toFixed(1);
const fmtMs = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "–"
    : v >= 10_000
      ? `${(v / 1000).toFixed(1)} s`
      : `${Math.round(v)} ms`;
const fmtMb = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : `${Math.round(v / MB).toLocaleString("en-US")} MB`;
const fmtInt = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : v.toLocaleString("en-US");

function readOpen(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean): void {
  try {
    sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // per-tab convenience only
  }
}

function readResources(): ResourceEntryLite[] {
  try {
    return performance.getEntriesByType("resource").map((e) => ({
      name: e.name,
      startTime: e.startTime,
      responseEnd: (e as PerformanceResourceTiming).responseEnd,
    }));
  } catch {
    return [];
  }
}

/** The graph canvas: the largest <canvas> on the page (timeline and charts are smaller). */
function graphCanvasSize(): { width: number; height: number } {
  let best = { width: 0, height: 0 };
  for (const canvas of document.querySelectorAll("canvas")) {
    const { width, height } = canvas.getBoundingClientRect();
    if (width * height > best.width * best.height) best = { width, height };
  }
  return { width: Math.round(best.width), height: Math.round(best.height) };
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const tag = el?.tagName?.toLowerCase() ?? "";
  return (
    tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable === true
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3 leading-[18px]">
      <span className="text-white/55">{label}</span>
      <span className={cn("text-right font-semibold tabular-nums", tone ?? "text-white")}>
        {value}
      </span>
    </div>
  );
}

function fpsTone(fps: number | null | undefined): string | undefined {
  if (fps === null || fps === undefined) return undefined;
  if (fps > 30) return "text-emerald-400";
  if (fps > 20) return "text-amber-300";
  return "text-red-400";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/15 pt-1.5">
      <div className="mb-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-white/40">
        {title}
      </div>
      {children}
    </div>
  );
}

export interface BenchHudProps {
  runId: string;
  networkId: string;
  topology: TopologyResponse | null;
}

export function BenchHud({ runId, networkId, topology }: BenchHudProps) {
  const [open, setOpen] = useState(readOpen);
  const [environment, setEnvironment] = useState<BenchEnvironment | null>(null);
  const [refreshMs, setRefreshMs] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<BenchResultDocument | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const mounted = useRef(true);

  const events = useProbeEvents();
  const live = useLiveFrameStats(open && !recording, refreshMs);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      const interval = await sampleRefreshInterval(browserRuntime, 1_000);
      const env = await collectEnvironment(
        interval !== null ? 1000 / interval : null,
        longTasksSupported(),
      );
      if (cancelled) return;
      setRefreshMs(interval);
      setEnvironment(env);
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      writeOpen(!prev);
      return !prev;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "H" && e.key !== "h") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const load: LoadTimings = useMemo(
    () => deriveLoadTimings(events, runId, networkId, readResources()),
    [events, runId, networkId],
  );

  const network: HudNetwork = useMemo(() => {
    const agents = topology?.agents.length ?? null;
    const edges = topology?.edges.length ?? null;
    return {
      runId,
      networkId,
      agents,
      edges,
      density: agents !== null && edges !== null ? inferDensity(agents, edges) : null,
    };
  }, [topology, runId, networkId]);

  const gpuEstimate = useCallback(() => {
    if (network.agents === null || network.edges === null) return null;
    const size = graphCanvasSize();
    return {
      size,
      estimate: estimateGpuMemory({
        points: network.agents,
        links: network.edges,
        clustering: false,
        canvasWidth: size.width,
        canvasHeight: size.height,
        devicePixelRatio: window.devicePixelRatio,
      }),
    };
  }, [network]);

  const copyMetrics = useCallback(async () => {
    const snapshot = buildHudSnapshot({
      build: currentBuildInfo(),
      environment,
      network,
      live: live?.snapshot ?? null,
      heap: live?.heap ?? readBrowserHeap(),
      load,
      gpuMemoryEstimate: gpuEstimate()?.estimate ?? null,
    });
    const text = JSON.stringify(snapshot, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setFallbackText(null);
    } catch {
      setCopyState("failed");
      setFallbackText(text);
    }
  }, [environment, network, live, load, gpuEstimate]);

  const record = useCallback(async () => {
    if (environment === null || recording) return;
    setRecording(true);
    setRecorded(null);
    const startedAt = new Date();
    const recorder = createFrameRecorder({
      runtime: browserRuntime,
      readHeap: readBrowserHeap,
      observeLongTasks: observeBrowserLongTasks,
    });
    recorder.start();
    await browserRuntime.sleep(RECORD_MS);
    const recordingResult = recorder.stop();
    // After the window: the browser answers on its next GC (cross-origin isolated pages only).
    const uaMemory = await measureUaMemory(10_000);
    if (!mounted.current) return;
    const gpu = gpuEstimate();
    const doc = buildHudRecordDocument({
      build: currentBuildInfo(),
      environment,
      network,
      phase: toPhaseResult({
        phase: "hud-record",
        warmupMs: 0,
        measureMs: RECORD_MS,
        recording: recordingResult,
        refreshIntervalMs: refreshMs,
        uaMemory,
      }),
      load,
      gpuMemoryEstimate: gpu?.estimate ?? null,
      stage: {
        width: gpu?.size.width ?? 0,
        height: gpu?.size.height ?? 0,
        devicePixelRatio: window.devicePixelRatio,
      },
      startedAt,
      context: { path: location.pathname },
    });
    setRecorded(doc);
    setRecording(false);
  }, [environment, recording, gpuEstimate, network, refreshMs, load]);

  const build = currentBuildInfo();

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        title="Benchmark HUD (Shift+H)"
        data-harness={BENCH_HARNESS_MARKER}
        className="fixed right-3 bottom-3 z-[60] rounded-md bg-black/75 px-2 py-1 font-mono text-[10px] font-semibold text-white shadow"
      >
        FPS HUD
      </button>
    );
  }

  const w = live?.snapshot.window;
  const recordedPhase = recorded?.scenarios[0]?.phases[0];
  return (
    <aside
      aria-label="Benchmark HUD"
      data-harness={BENCH_HARNESS_MARKER}
      className="fixed right-3 bottom-3 z-[60] max-h-[calc(100vh-24px)] w-[300px] space-y-1.5 overflow-y-auto rounded-lg bg-black/80 p-2.5 font-mono text-[10.5px] text-white shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          Bench HUD{" "}
          <span className="text-white/45">
            · {build.gitCommit.slice(0, 7)} · {build.mode}
          </span>
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-label="Close the benchmark HUD"
          className="rounded px-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      <Section
        title={
          recording
            ? "FPS (paused while recording)"
            : `FPS · last ${(live?.snapshot.windowMs ?? 5000) / 1000} s`
        }
      >
        <Row
          label="current"
          value={fmtFps(live?.snapshot.currentFps)}
          tone={fpsTone(live?.snapshot.currentFps)}
        />
        <Row label="mean" value={fmtFps(w?.fps.mean)} tone={fpsTone(w?.fps.mean)} />
        <Row label="1% low" value={fmtFps(w?.fps.p1)} tone={fpsTone(w?.fps.p1)} />
        <Row label="median" value={fmtFps(w?.fps.median)} tone={fpsTone(w?.fps.median)} />
        <Row label="p5" value={fmtFps(w?.fps.p5)} tone={fpsTone(w?.fps.p5)} />
        <Row
          label="frames > 33.3 ms (window)"
          value={w ? `${w.framesOver33ms} / ${w.frames}` : "–"}
        />
        <Row label="frames > 50 ms (session)" value={fmtInt(live?.snapshot.totals.over50ms)} />
        <Row label="dropped frames est. (window)" value={fmtInt(w?.droppedFramesEst)} />
      </Section>

      <Section title="JS heap (performance.memory)">
        <Row
          label="used / total"
          value={
            live?.heap
              ? `${fmtMb(live.heap.usedBytes)} / ${fmtMb(live.heap.totalBytes)}`
              : "unavailable"
          }
        />
        <Row label="limit" value={fmtMb(live?.heap?.limitBytes)} />
      </Section>

      <Section title="Network">
        <Row
          label="agents / edges"
          value={`${fmtInt(network.agents)} / ${fmtInt(network.edges)}`}
        />
        <Row
          label="density (inferred)"
          value={network.density === null ? "–" : String(network.density)}
        />
        <Row label="topology fetches" value={fmtInt(load.topologyFetches)} />
      </Section>

      <Section title="Load timings">
        <Row label="topology fetch" value={fmtMs(load.fetchMs)} />
        <Row label="· network (Resource Timing)" value={fmtMs(load.networkMs)} />
        <Row label="· JSON parse" value={fmtMs(load.parseMs)} />
        <Row label="topologyToData" value={fmtMs(load.toDataMs)} />
        <Row label="prepareCosmographData" value={fmtMs(load.prepareMs)} />
        <Row label="mount" value={fmtMs(load.mountMs)} />
        <Row label="· upload (first frame)" value={fmtMs(load.uploadMs)} />
        <Row label="layout until freeze" value={fmtMs(load.layoutMs)} />
        <Row label="total" value={fmtMs(load.totalMs)} />
      </Section>

      <Section title="Environment">
        {environment === null ? (
          <Row label="collecting" value="…" />
        ) : (
          <>
            <div className="break-words text-white/80">{environmentLabel(environment)}</div>
            <Row
              label="device memory"
              value={environment.deviceMemoryGb !== null ? `${environment.deviceMemoryGb} GB` : "–"}
            />
            <Row
              label="screen · DPR"
              value={`${environment.screen.width}×${environment.screen.height} · ${environment.devicePixelRatio}`}
            />
            <Row
              label="viewport"
              value={`${environment.viewport.width}×${environment.viewport.height}`}
            />
            <Row
              label="refresh est."
              value={
                environment.refreshRateHzEst !== null
                  ? `${Math.round(environment.refreshRateHzEst)} Hz`
                  : "–"
              }
            />
            {environment.gpu.softwareRendering && (
              <div className="text-red-400">Software rendering — numbers are not valid.</div>
            )}
          </>
        )}
      </Section>

      <div className="flex flex-wrap gap-1.5 border-t border-white/15 pt-2">
        <button
          type="button"
          onClick={() => void copyMetrics()}
          className="rounded bg-white/15 px-2 py-1 font-semibold hover:bg-white/25"
        >
          {copyState === "copied" ? "Copied" : "Copy metrics"}
        </button>
        <button
          type="button"
          onClick={() => void record()}
          disabled={recording || environment === null}
          className="rounded bg-white/15 px-2 py-1 font-semibold hover:bg-white/25 disabled:opacity-50"
        >
          {recording ? "Recording 10 s…" : "Record 10 s"}
        </button>
      </div>

      {fallbackText !== null && (
        <textarea
          readOnly
          aria-label="Metrics JSON (clipboard unavailable)"
          className="h-24 w-full rounded bg-white/10 p-1 text-[9.5px]"
          value={fallbackText}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}

      {recorded !== null && recordedPhase !== undefined && (
        <Section title="Last recording (10 s)">
          <Row
            label="mean / 1% low / median"
            value={`${fmtFps(recordedPhase.frames.fps.mean)} / ${fmtFps(recordedPhase.frames.fps.p1)} / ${fmtFps(recordedPhase.frames.fps.median)}`}
          />
          <Row
            label="frames > 33.3 ms"
            value={
              recordedPhase.frames.slowFrameShare === null
                ? "–"
                : `${(recordedPhase.frames.slowFrameShare * 100).toFixed(1)} %`
            }
          />
          <Row
            label="long tasks"
            value={
              recordedPhase.longTasks.supported
                ? String(recordedPhase.longTasks.count)
                : "unsupported"
            }
          />
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              className="rounded bg-white/15 px-2 py-1 font-semibold hover:bg-white/25"
              onClick={() =>
                downloadText(
                  `${resultFileStem(recorded)}.json`,
                  JSON.stringify(recorded, null, 2),
                  "application/json",
                )
              }
            >
              Download JSON
            </button>
            <button
              type="button"
              className="rounded bg-white/15 px-2 py-1 font-semibold hover:bg-white/25"
              onClick={() =>
                downloadText(`${resultFileStem(recorded)}.csv`, resultToCsv(recorded), "text/csv")
              }
            >
              Download CSV
            </button>
          </div>
        </Section>
      )}
    </aside>
  );
}
