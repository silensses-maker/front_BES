/**
 * Build-time constants replaced by Rsbuild (`source.define` in rsbuild.config.ts) and by Vitest
 * (`define` in vitest.config.ts). They are literals in the output, never runtime lookups.
 */

/**
 * True only in benchmark builds (`PUBLIC_BENCHMARK=true`, `bun run bench`) (#126). Guard every
 * harness entry point with it as the FIRST operand (`if (__BENCHMARK__) …`,
 * `__BENCHMARK__ && …`) so normal builds drop the code as dead branches.
 */
declare const __BENCHMARK__: boolean;

/** Build metadata of a benchmark build; `null` in every other build. */
declare const __BENCH_BUILD__: {
  appVersion: string;
  gitCommit: string;
  gitDirty: boolean | null;
  builtAt: string;
} | null;
