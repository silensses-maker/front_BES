import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import mdx from "@mdx-js/rollup";

/** Same value rsbuild.config.ts compiles in (#127). */
const APP_VERSION: string = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
).version;

export default defineConfig({
  // The user manual's MDX sections (src/pages/docs/content) compile in tests as in the build
  // (@rsbuild/plugin-mdx there), so the docs tests render the real content. `pre`: MDX must turn
  // into JS before the JSX/TS transforms run.
  plugins: [{ enforce: "pre", ...mdx() }],
  // Build-time constants (src/shared/config/build-flags.d.ts): tests run as a normal build, where
  // the benchmark harness (#126) is compiled out.
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BENCHMARK__: "false",
    __BENCH_BUILD__: "null",
    // polarization (#129): always compiled in under test, so its tests and the integration points
    // run whatever the build default is (the flag-off build is checked on dist/ instead).
    __POLARIZATION__: "true",
    // Dev-only Firebase Auth emulator: off, as in every build but `rsbuild dev` with the flag
    __AUTH_EMULATOR__: "false",
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "dist"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "src/entities/**/*.ts",
        "src/features/**/*.ts",
        "src/shared/lib/**/*.ts",
        "src/shared/workers/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        // Coverage measures the logic layer (.ts) only, like SonarCloud (ui/** excluded).
        // Component tests load .tsx files, which would otherwise be counted too.
        "**/*.tsx",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/index.ts",
        "**/types/**",
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});