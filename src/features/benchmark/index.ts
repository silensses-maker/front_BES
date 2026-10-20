/**
 * Benchmark harness (#126) — measurement tooling for the thesis (OE3), NOT a user feature.
 * Reachable only from benchmark builds (`PUBLIC_BENCHMARK=true`, `bun run bench`): every
 * importer guards its import with `__BENCHMARK__`, so normal builds contain none of this slice.
 */
export { currentBuildInfo } from "./lib/build-info";
export { downloadText } from "./lib/download";
export {
  type BenchEnvironment,
  collectEnvironment,
  environmentLabel,
  measureUaMemory,
} from "./lib/environment";
export {
  createFrameRecorder,
  longTasksSupported,
  observeBrowserLongTasks,
  readBrowserHeap,
} from "./lib/frame-recorder";
export { sampleRefreshInterval } from "./lib/refresh-rate";
export { resultToCsv } from "./lib/result-csv";
export {
  BENCH_HARNESS_MARKER,
  BENCH_SCHEMA_VERSION,
  type BenchResultDocument,
  createResultDocument,
  resultFileStem,
  type ScenarioResult,
} from "./lib/result-schema";
export { browserRuntime } from "./lib/runtime";
export {
  type CanvasTimings,
  DEFAULT_SUITE_CONFIG,
  estimateSuiteMs,
  expandMatrix,
  formatDuration,
  parseSuiteQuery,
  type SuiteConfig,
  suiteQuery,
  validateSuiteConfig,
} from "./lib/suite-config";
export {
  type BenchStage,
  runSuite,
  type SuiteProgress,
  type SuiteRunnerDeps,
} from "./model/suite-runner";
export { BenchHud, type BenchHudProps } from "./ui/bench-hud";
export { SuiteConfigForm } from "./ui/suite-config-form";
export { SuiteResultsTable } from "./ui/suite-results-table";
