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
 * polarization (#129): src/shared/lib/polarization + src/features/run-polarization (the values
 * are computed on the server by pol_measures). ON unless the build sets
 * PUBLIC_ENABLE_POLARIZATION=false (the default lives in rsbuild.config.ts, not in a .env file).
 * Guard every integration point with it so a disabled build computes no fine histograms, shows no
 * polarization UI or wiki section, and drops the code as dead code. Vitest always compiles it in
 * (vitest.config.ts), so its tests run whatever the default.
 */
declare const __POLARIZATION__: boolean;

/** Build metadata of a benchmark build; `null` in every other build. */
declare const __BENCH_BUILD__: {
  appVersion: string;
  gitCommit: string;
  gitDirty: boolean | null;
  builtAt: string;
} | null;

/**
 * True only in a development build (`rsbuild dev`) with `PUBLIC_AUTH_EMULATOR=true`: Firebase Auth
 * then talks to a local Auth emulator (src/shared/api/firebase/config.ts; README, "Local auth
 * emulator"). Every other build, and Vitest, compiles it to `false`, so the emulator call is dead
 * code there; the flag is refused in CI and on Vercel (rsbuild.config.ts).
 */
declare const __AUTH_EMULATOR__: boolean;
