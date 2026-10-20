/**
 * Build-time constants replaced by Rsbuild (`source.define` in rsbuild.config.ts) and by Vitest
 * (`define` in vitest.config.ts). They are literals in the output, never runtime lookups.
 */

/**
 * Application version (`package.json` `version`), compiled into EVERY build (#127). Recorded in
 * configuration exports (`appVersion`) and benchmark results.
 */
declare const __APP_VERSION__: string;

/**
 * True only in benchmark builds (`PUBLIC_BENCHMARK=true`, `bun run bench`) (#126). Guard every
 * harness entry point with it as the FIRST operand (`if (__BENCHMARK__) …`,
 * `__BENCHMARK__ && …`) so normal builds drop the code as dead branches.
 */
declare const __BENCHMARK__: boolean;

/**
 * polarization replica (#129): src/shared/lib/polarization + src/features/run-polarization.
 * ON unless the build sets PUBLIC_ENABLE_POLARIZATION=false (the default lives in rsbuild.config.ts,
 * not in a .env file). Guard every integration point with it so a disabled build computes no fine
 * histograms, shows no polarization UI or wiki section, and drops the replica as dead code.
 * Vitest always compiles it in (vitest.config.ts), so the replica's tests run whatever the default.
 */
declare const __POLARIZATION__: boolean;

/** Build metadata of a benchmark build; `null` in every other build. */
declare const __BENCH_BUILD__: {
  appVersion: string;
  gitCommit: string;
  gitDirty: boolean | null;
  builtAt: string;
} | null;
