import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';

// ── Benchmark harness gating (#126) ────────────────────────────────────────────
// The harness (/bench suite page, run-view debug HUD, topology/canvas probes) is compiled in ONLY
// when the build sets PUBLIC_BENCHMARK=true (`bun run bench`). `__BENCHMARK__` is a build-time
// literal: every harness entry point is guarded by it, so a normal build drops the route, the lazy
// chunks and the probe calls as dead code. A bench build also:
//  - writes to dist-bench/ (never dist/, which Docker, Vercel and CI deploy), and
//  - refuses to run in CI or on Vercel at all.
const BENCHMARK = process.env.PUBLIC_BENCHMARK === 'true';

if (BENCHMARK && (process.env.CI || process.env.VERCEL)) {
  throw new Error(
    '[bench] PUBLIC_BENCHMARK=true is refused in CI/Vercel builds: the benchmark harness is local-only (#126).',
  );
}

// ── polarization (#129): kill switch ────────────────────────────────────────────────────────
// The polarization measures (computed on the server by pol_measures; client side in
// src/shared/lib/polarization + src/features/run-polarization) are compiled in by default; only
// PUBLIC_ENABLE_POLARIZATION=false (exactly) turns them off, which drops the fine histograms, the
// Polarization chart tab, the wiki section and that code. The backend has its own switch
// (APP_POLARIZATION). The default lives HERE, not in a .env file (Rsbuild gives .env.production
// priority).
const POLARIZATION = process.env.PUBLIC_ENABLE_POLARIZATION !== 'false';

/**
 * Application version from package.json, read once per build and compiled in as `__APP_VERSION__`
 * in EVERY build (#127): configuration exports and benchmark results record it. Builds always run
 * from the project root (bun scripts, the Dockerfile's WORKDIR, Vercel), next to package.json; a
 * missing or empty version fails the build instead of shipping "unknown".
 */
const APP_VERSION: string = (() => {
  const version: unknown = JSON.parse(readFileSync('./package.json', 'utf8')).version;
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('[build] package.json has no "version" to compile in as __APP_VERSION__.');
  }
  return version;
})();

/** Build metadata recorded with every benchmark result (bench builds only). */
function benchBuildInfo() {
  const git = (cmd: string): string | null => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return null;
    }
  };
  const status = git('git status --porcelain');
  return {
    appVersion: APP_VERSION,
    gitCommit: git('git rev-parse --short=12 HEAD') ?? 'unknown',
    gitDirty: status === null ? null : status.length > 0,
    builtAt: new Date().toISOString(),
  };
}

/** COOP/COEP for `bench:isolated` — enables measureUserAgentSpecificMemory, breaks the login popup. */
const BENCH_ISOLATION_HEADERS =
  BENCHMARK && process.env.BENCH_ISOLATED === 'true'
    ? {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      }
    : undefined;

export default defineConfig({
  plugins: [pluginReact()],

  html: {
    template: './index.html',
  },

  source: {
    entry: {
      index: './src/main.tsx',
    },
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __BENCHMARK__: JSON.stringify(BENCHMARK),
      __BENCH_BUILD__: JSON.stringify(BENCHMARK ? benchBuildInfo() : null),
      // polarization (#129): remove with src/shared/lib/polarization + src/features/run-polarization
      __POLARIZATION__: JSON.stringify(POLARIZATION),
    },
  },

  ...(BENCHMARK && { output: { distPath: { root: 'dist-bench' } } }),

  // Vendors follow the chunks that use them (#130): React, React Router and axios get their own
  // initial chunks; Firebase Auth (observed by the app shell at startup) stays in the shared
  // initial vendor chunk; the visualization stack is reachable only from the lazy live-run page.
  // ECharts is forced into its own async chunk so it caches apart from Cosmograph + DuckDB-WASM.
  // Do not switch to 'single-vendor': one vendor chunk would put that stack back on the login page.
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
      forceSplitting: {
        'lib-echarts': /node_modules[\\/](echarts|echarts-for-react|zrender|size-sensor)[\\/]/,
      },
    },
  },

  tools: {
    rspack: {
      plugins: [
        process.env.RSDOCTOR &&
          new RsdoctorRspackPlugin({
            disableClientServer: false,
            features: ['loader', 'plugins', 'bundle'],
          }),
      ].filter(Boolean),
    },
  },

  // Bench builds serve on loopback only (the harness also checks location.hostname at runtime).
  server: BENCHMARK
    ? { port: 4100, host: '127.0.0.1', open: false, headers: BENCH_ISOLATION_HEADERS }
    : {
        port: 4000,
        open: true,
      },

  dev: {
    hmr: true,
  },
});
