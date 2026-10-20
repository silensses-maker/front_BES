import { describe, expect, it } from "vitest";
import type { GeneratedRunConfig } from "@/shared/api/backend";
import { effectiveDensityOf, recoverRequestedDensity, relaunchPrefill } from "./relaunch";
import { RUN_SAVE_MODE } from "./templates";
import { computeMaxEdges, MAX_SEED, validateGeneratedForm } from "./validation";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** densityFactor of every role (DatabaseManager.getUsageLimits). */
const ROLE_FACTORS = [1.0, 0.75, 0.5];

/** Stored config of a run launched from the wizard with `density` and `densityFactor`. */
function storedRun(
  n: number,
  density: number,
  densityFactor: number,
  overrides: Partial<GeneratedRunConfig> = {},
): GeneratedRunConfig {
  const edges = computeMaxEdges(density, n);
  return {
    runId: "7123456789012345678",
    type: "generated",
    numberOfNetworks: 3,
    agentsPerNetwork: n,
    effectiveDensity: effectiveDensityOf(density, densityFactor, n),
    iterationLimit: 250,
    stopThreshold: 0.005,
    seed: "4503599627370496",
    frameRetention: "ephemeral",
    agentTypes: [
      { silenceStrategy: 0, silenceEffect: 0, count: n - 2 },
      { silenceStrategy: 3, silenceEffect: 1, count: 2 },
    ],
    biasTypes: [
      { biasType: 0, count: edges - 5 },
      { biasType: 2, count: 5 },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("effectiveDensityOf", () => {
  it("floors density × densityFactor and clamps it to [1, n − 1] (Server.clampEffectiveDensity)", () => {
    expect(effectiveDensityOf(7, 0.5, 100)).toBe(3);
    expect(effectiveDensityOf(7, 0.75, 100)).toBe(5);
    expect(effectiveDensityOf(7, 1, 100)).toBe(7);
    expect(effectiveDensityOf(1, 0.5, 100)).toBe(1);
    expect(effectiveDensityOf(50, 1, 10)).toBe(9);
  });
});

describe("recoverRequestedDensity", () => {
  it("is exact for every run the wizard can launch (all roles, n up to 80)", () => {
    for (const factor of ROLE_FACTORS) {
      for (let n = 3; n <= 80; n++) {
        for (let d = 2; d < n; d++) {
          const m = effectiveDensityOf(d, factor, n);
          const recovered = recoverRequestedDensity(m, n, computeMaxEdges(d, n), factor);
          expect(recovered, `n=${n} d=${d} f=${factor}`).toEqual({ density: d, exact: true });
        }
      }
    }
  });

  it("is exact for large networks too (admins: no agent cap)", () => {
    for (const [n, d] of [
      [100_000, 7],
      [1_000_000, 50],
      [250_000, 249_999],
    ] as const) {
      const recovered = recoverRequestedDensity(
        effectiveDensityOf(d, 0.75, n),
        n,
        computeMaxEdges(d, n),
        0.75,
      );
      expect(recovered).toEqual({ density: d, exact: true });
    }
  });

  it("falls back to ceil(m / densityFactor) when the bias total is not an edge count", () => {
    // API-created run: bias counts above the 34 edges of (n = 10, d = 2)
    expect(recoverRequestedDensity(2, 10, 40, 0.5)).toEqual({ density: 4, exact: false });
    expect(recoverRequestedDensity(3, 20, 1000, 0.75)).toEqual({ density: 4, exact: false });
    expect(recoverRequestedDensity(3, 20, 1000, 1)).toEqual({ density: 3, exact: false });
    // The fallback gives back the stored effective density under that factor
    for (const factor of ROLE_FACTORS) {
      for (const m of [1, 2, 3, 5, 8]) {
        const { density } = recoverRequestedDensity(m, 50, 10 ** 9, factor);
        expect(effectiveDensityOf(density, factor, 50)).toBe(m);
        if (density > 1) expect(effectiveDensityOf(density - 1, factor, 50)).toBeLessThan(m);
      }
    }
  });

  it("rejects a root below the effective density (it cannot be the requested one)", () => {
    // T = edges(d = 2, n = 10) but the run used m = 3: not a wizard run → fallback
    expect(recoverRequestedDensity(3, 10, computeMaxEdges(2, 10), 1)).toEqual({
      density: 3,
      exact: false,
    });
  });

  it("uses the effective density when the factor is unusable", () => {
    expect(recoverRequestedDensity(4, 30, 1, 0)).toEqual({ density: 4, exact: false });
    expect(recoverRequestedDensity(4, 30, 1, Number.NaN)).toEqual({ density: 4, exact: false });
  });
});

describe("relaunchPrefill", () => {
  it("rebuilds the wizard values of a stored run, valid as they are", () => {
    const config = storedRun(40, 6, 0.75);
    const prefill = relaunchPrefill(config, 0.75);

    expect(prefill.values).toEqual({
      networkType: "generated",
      numberOfAgents: 40,
      numberOfNetworks: 3,
      density: 6,
      iterationLimit: 250,
      stopThreshold: 0.005,
      seed: 4503599627370496,
      saveMode: RUN_SAVE_MODE,
      agentTypes: [
        { id: "relaunch-a0", count: 38, silenceStrategy: 0, silenceEffect: 0 },
        { id: "relaunch-a1", count: 2, silenceStrategy: 3, silenceEffect: 1 },
      ],
      biasTypes: [
        { id: "relaunch-b0", count: computeMaxEdges(6, 40) - 5, cognitiveBias: 0 },
        { id: "relaunch-b1", count: 5, cognitiveBias: 2 },
      ],
    });
    expect(prefill.densityExact).toBe(true);
    expect(prefill.seedKept).toBe(true);
    expect(prefill.effectiveNow).toBe(config.effectiveDensity);
    expect(validateGeneratedForm(prefill.values, 1000, 1000, 20)).toEqual({});
  });

  it("keeps the seed bounds 0 and 2^53 − 1 exactly", () => {
    expect(relaunchPrefill(storedRun(10, 2, 1, { seed: "0" }), 1).values.seed).toBe(0);
    expect(relaunchPrefill(storedRun(10, 2, 1, { seed: String(MAX_SEED) }), 1).values.seed).toBe(
      MAX_SEED,
    );
  });

  it("drops seeds the wizard cannot hold (negative, beyond 2^53 − 1, malformed)", () => {
    for (const seed of ["-5", "9007199254740992", "9223372036854775807", "", "1e3", "007"]) {
      const prefill = relaunchPrefill(storedRun(10, 2, 1, { seed }), 1);
      expect(prefill.values.seed, seed).toBeNull();
      expect(prefill.seedKept, seed).toBe(false);
    }
  });

  it("reports when the current quotas would build other networks", () => {
    // Launched as an Administrator (factor 1, m = 6), re-launched as a Researcher (0.75 → m = 4)
    const prefill = relaunchPrefill(storedRun(40, 6, 1), 0.75);
    expect(prefill.densityExact).toBe(true);
    expect(prefill.values.density).toBe(6);
    expect(prefill.effectiveNow).toBe(4);
  });

  it("flags an estimated density for runs whose bias counts exceed the edges", () => {
    const config = storedRun(20, 4, 0.5, {
      biasTypes: [{ biasType: 1, count: 10_000 }],
    });
    const prefill = relaunchPrefill(config, 0.5);
    expect(prefill.densityExact).toBe(false);
    expect(prefill.values.density).toBe(4);
    expect(prefill.effectiveNow).toBe(config.effectiveDensity);
  });
});
