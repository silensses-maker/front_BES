import type { BenchBuildInfo } from "./result-schema";

/** Build metadata injected by rsbuild.config.ts (`__BENCH_BUILD__`, bench builds only). */
export function currentBuildInfo(
  build: typeof __BENCH_BUILD__ = __BENCH_BUILD__,
  mode: string = import.meta.env.MODE,
): BenchBuildInfo {
  return {
    mode,
    appVersion: build?.appVersion ?? "unknown",
    gitCommit: build?.gitCommit ?? "unknown",
    gitDirty: build?.gitDirty ?? null,
    builtAt: build?.builtAt ?? "unknown",
  };
}
