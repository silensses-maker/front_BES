import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Build-time constants (src/shared/config/build-flags.d.ts): tests run as a normal build, where
  // the benchmark harness (#126) is compiled out.
  define: {
    __BENCHMARK__: "false",
    __BENCH_BUILD__: "null",
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