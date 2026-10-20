import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSimulationStore } from "@/entities/simulation";
import {
  type BenchResultDocument,
  type BenchStage,
  browserRuntime,
  type CanvasTimings,
  collectEnvironment,
  createFrameRecorder,
  createResultDocument,
  currentBuildInfo,
  downloadText,
  environmentLabel,
  estimateSuiteMs,
  expandMatrix,
  formatDuration,
  longTasksSupported,
  measureUaMemory,
  observeBrowserLongTasks,
  parseSuiteQuery,
  readBrowserHeap,
  resultFileStem,
  resultToCsv,
  runSuite,
  type SuiteConfig,
  SuiteConfigForm,
  type SuiteProgress,
  SuiteResultsTable,
  type SuiteRunnerDeps,
  sampleRefreshInterval,
  suiteQuery,
  validateSuiteConfig,
} from "@/features/benchmark";
import {
  CLUSTER_REANIMATE_MS,
  DECLUSTER_PLAY_DELAY_MS,
  LAYOUT_DURATION_MS,
  SimulationCanvas,
} from "@/features/simulation-canvas";
import {
  type IndexedChunk,
  indexChunkBuffer,
  mergeRoundFromChunk,
  PLAYBACK_BASE_RPS,
} from "@/features/simulation-replay";
import type { TopologyResponse } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";
import { Button } from "@/shared/ui/button";

/**
 * /bench — benchmark suite page (#126). Exists only in benchmark builds on a loopback host
 * (see app/routes.tsx); no login: synthetic networks need no backend. Developer tool, English
 * only. The page composes the harness (features/benchmark) with the REAL run-view pieces:
 * SimulationCanvas (features/simulation-canvas) and the replay chunk merge
 * (features/simulation-replay), so the numbers apply to the product.
 */

const CANVAS_TIMINGS: CanvasTimings = {
  layoutMs: LAYOUT_DURATION_MS,
  clusterMs: CLUSTER_REANIMATE_MS,
  declusterMs: DECLUSTER_PLAY_DELAY_MS,
};

type RunState = "idle" | "preparing" | "running" | "done" | "aborted" | "error";

interface StageContent {
  key: string;
  topology: TopologyResponse;
}

/**
 * The canvas under test. Memoized so progress updates of the page never re-render it — only a
 * new topology or the playback flag do, as in the run view.
 */
const BenchStageView = memo(function BenchStageView({
  content,
  playbackActive,
}: {
  content: StageContent | null;
  playbackActive: boolean;
}) {
  if (content === null) return null;
  return (
    <SimulationCanvas
      key={content.key}
      status="completed"
      topology={content.topology}
      playbackActive={playbackActive}
    />
  );
});

const openFrames: SuiteRunnerDeps["openFrames"] = (buffer, agents) => {
  const rounds = indexChunkBuffer(buffer);
  const chunk: IndexedChunk = { from: 0, to: Math.max(0, rounds.size - 1), buffer, rounds };
  return (round) => mergeRoundFromChunk(chunk, round, agents);
};

export function BenchPage() {
  const initial = useMemo(() => parseSuiteQuery(window.location.search), []);
  const [config, setConfig] = useState<SuiteConfig>(initial.config);
  const [runState, setRunState] = useState<RunState>("idle");
  const [progress, setProgress] = useState<SuiteProgress | null>(null);
  const [doc, setDoc] = useState<BenchResultDocument | null>(null);
  const [stageContent, setStageContent] = useState<StageContent | null>(null);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [envLine, setEnvLine] = useState<string | null>(null);
  const [softwareGl, setSoftwareGl] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const progressRef = useRef<SuiteProgress | null>(null);
  const autorunDone = useRef(false);

  const build = currentBuildInfo();
  const errors = validateSuiteConfig(config);
  const scenarioCount = expandMatrix(config).length;
  const estimate = estimateSuiteMs(config, CANVAS_TIMINGS);
  const running = runState === "preparing" || runState === "running";

  useEffect(() => {
    let cancelled = false;
    void collectEnvironment(null, longTasksSupported()).then((env) => {
      if (cancelled) return;
      setEnvLine(environmentLabel(env));
      setSoftwareGl(env.gpu.softwareRendering);
    });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      useSimulationStore.getState().reset();
    };
  }, []);

  // A hidden tab throttles requestAnimationFrame: record it, the numbers of that window are void.
  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      const p = progressRef.current;
      const where = p ? ` during ${p.scenario.id} (${p.step})` : "";
      const warning = `Tab hidden at ${new Date().toISOString()}${where}: frames were throttled.`;
      setDoc((d) => (d ? { ...d, warnings: [...d.warnings, warning] } : d));
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [running]);

  const start = useCallback(async () => {
    if (validateSuiteConfig(config).length > 0) return;
    setRunState("preparing");
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const refresh = await sampleRefreshInterval(browserRuntime, 1_500);
      const environment = await collectEnvironment(
        refresh !== null ? 1000 / refresh : null,
        longTasksSupported(),
      );
      const document_ = createResultDocument({
        kind: "suite",
        build: currentBuildInfo(),
        environment,
        config: {
          ...config,
          canvasTimings: CANVAS_TIMINGS,
          playbackBaseRps: PLAYBACK_BASE_RPS,
          estimatedMs: estimateSuiteMs(config, CANVAS_TIMINGS),
          query: suiteQuery(config),
        },
      });
      if (environment.gpu.softwareRendering) {
        document_.warnings.push(
          `Software rendering (${environment.gpu.renderer ?? "unknown"}): results are not valid.`,
        );
      }
      if (build.mode !== "production") {
        document_.warnings.push(
          `${build.mode} build: measure the optimized \`bun run bench\` build.`,
        );
      }
      setDoc(document_);
      setRunState("running");

      const stage: BenchStage = {
        mount: (topology, key) => setStageContent({ topology, key }),
        unmount: () => {
          setStageContent(null);
          setPlaybackActive(false);
          useSimulationStore.getState().reset();
        },
        setPlaybackActive,
        showFrame: (frame) => useSimulationStore.getState().updateFrame(frame),
        size: () => {
          const rect = stageRef.current?.getBoundingClientRect();
          return { width: Math.round(rect?.width ?? 0), height: Math.round(rect?.height ?? 0) };
        },
      };
      const gc = (globalThis as { gc?: () => void }).gc;
      const deps: SuiteRunnerDeps = {
        stage,
        openFrames,
        runtime: browserRuntime,
        createRecorder: () =>
          createFrameRecorder({
            runtime: browserRuntime,
            readHeap: readBrowserHeap,
            observeLongTasks: observeBrowserLongTasks,
          }),
        measureUaMemory,
        canvasTimings: CANVAS_TIMINGS,
        playbackBaseRps: PLAYBACK_BASE_RPS,
        refreshIntervalMs: refresh,
        devicePixelRatio: window.devicePixelRatio,
        gc: typeof gc === "function" ? () => gc() : null,
      };
      await runSuite(config, deps, controller.signal, {
        onProgress: (p) => {
          progressRef.current = p;
          setProgress(p);
        },
        onScenarioDone: (result) =>
          setDoc((d) => (d ? { ...d, scenarios: [...d.scenarios, result] } : d)),
        onPrewarm: (result) => setDoc((d) => (d ? { ...d, prewarm: result } : d)),
      });
      const aborted = controller.signal.aborted;
      setDoc((d) => (d ? { ...d, finishedAt: new Date().toISOString(), complete: !aborted } : d));
      setRunState(aborted ? "aborted" : "done");
    } catch (error) {
      logger.error("BenchPage.runSuite", error);
      setRunState("error");
    } finally {
      abortRef.current = null;
      progressRef.current = null;
      setStageContent(null);
      useSimulationStore.getState().reset();
    }
  }, [config, build.mode]);

  // ?autorun=1 starts the suite once (scripted runs; the URL holds the whole configuration).
  // Deferred one task so a StrictMode effect replay (dev builds) cancels it before it starts.
  useEffect(() => {
    if (!initial.autorun || autorunDone.current) return;
    const timer = setTimeout(() => {
      autorunDone.current = true;
      void start();
    }, 0);
    return () => clearTimeout(timer);
  }, [initial.autorun, start]);

  const exportJson = () => {
    if (doc)
      downloadText(`${resultFileStem(doc)}.json`, JSON.stringify(doc, null, 2), "application/json");
  };
  const exportCsv = () => {
    if (doc) downloadText(`${resultFileStem(doc)}.csv`, resultToCsv(doc), "text/csv");
  };

  const stageStyle =
    config.stage === "fill"
      ? { width: "100%", height: "calc(100vh - 120px)" }
      : { width: config.stage.width, height: config.stage.height };

  return (
    <main
      className="min-h-screen bg-background px-4 py-4 font-sans text-foreground"
      data-bench-state={runState}
      data-bench-scenarios={doc?.scenarios.length ?? 0}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">SiLEnSeSS benchmark harness</h1>
        <p className="font-mono text-xs text-muted-foreground">
          v{build.appVersion} · {build.gitCommit}
          {build.gitDirty ? " (dirty)" : ""} · {build.mode} build ·{" "}
          {envLine ?? "collecting environment…"}
        </p>
      </header>

      {(softwareGl || build.mode !== "production") && (
        <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {softwareGl &&
            "Software rendering detected (no GPU): numbers from this browser are not valid. "}
          {build.mode !== "production" &&
            "Development build: React dev mode distorts FPS — measure with `bun run bench`."}
        </p>
      )}

      {!running && (
        <section className="mb-3 rounded-xl border border-border bg-card p-4">
          <SuiteConfigForm config={config} onChange={setConfig} />
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
            <Button
              type="button"
              size="sm"
              onClick={() => void start()}
              disabled={errors.length > 0}
            >
              Start suite
            </Button>
            <span>
              {scenarioCount} scenario(s) · estimated {formatDuration(estimate)} (approximate)
            </span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] break-all">
              /bench?{suiteQuery(config)}
            </code>
          </div>
          {errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-destructive">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        {running && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => abortRef.current?.abort()}
          >
            Abort
          </Button>
        )}
        <span className="font-mono" aria-live="polite">
          {runState === "preparing" && "Measuring the display refresh rate…"}
          {runState === "running" &&
            (progress
              ? `Scenario ${progress.index + 1}/${progress.total} · ${progress.scenario.id} · ${progress.step}`
              : "Starting…")}
          {runState === "done" && "Suite finished."}
          {runState === "aborted" && "Suite aborted — partial results below."}
          {runState === "error" && "The suite failed (see the console)."}
        </span>
        {doc !== null && doc.scenarios.length > 0 && (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={exportJson}
              data-bench-export="json"
            >
              Export JSON
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={exportCsv}
              data-bench-export="csv"
            >
              Export CSV
            </Button>
          </>
        )}
      </section>

      <div
        ref={stageRef}
        style={stageStyle}
        className="relative mb-4 max-w-none overflow-hidden rounded-xl border border-border bg-muted/20"
      >
        <BenchStageView content={stageContent} playbackActive={playbackActive} />
      </div>

      {doc !== null && (
        <section className="flex flex-col gap-2">
          {doc.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-destructive">
              {doc.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {doc.prewarm !== null && (
            <p className="font-mono text-xs text-muted-foreground">
              Pre-warm (unmeasured, {doc.prewarm.id}): {doc.prewarm.status}
              {doc.prewarm.load.totalMs !== null &&
                ` · load ${Math.round(doc.prewarm.load.totalMs)} ms (prepareCosmographData ${Math.round(doc.prewarm.load.prepareMs ?? 0)} ms, includes the DuckDB-WASM cold start)`}
            </p>
          )}
          <SuiteResultsTable scenarios={doc.scenarios} />
        </section>
      )}
    </main>
  );
}
