import type { GeneratedRunConfig } from "@/shared/api/backend";
import type { GeneratedSimFormValues } from "../types/simulation-config.types";
import { RUN_SAVE_MODE } from "./templates";
import { computeMaxEdges, MAX_SEED } from "./validation";

/**
 * Barabási–Albert m the backend builds from a requested density (Server.clampEffectiveDensity):
 * `floor(density × densityFactor)` clamped to `[1, agentsPerNetwork − 1]`.
 */
export function effectiveDensityOf(
  density: number,
  densityFactor: number,
  agentsPerNetwork: number,
): number {
  return Math.min(Math.max(Math.floor(density * densityFactor), 1), agentsPerNetwork - 1);
}

/**
 * Requested density of a stored generated run, which keeps only its effective density `m`
 * (#127).
 *
 * Exact rule: the wizard only launches when the bias counts total
 * `computeMaxEdges(d, n) = −d² + (2n − 1)·d` for the requested density `d`, so `d` is the smaller
 * root of `d² − (2n − 1)·d + T = 0` (T = stored bias total). It is accepted when it is an integer
 * with `m ≤ d < n` that gives back `T` — true for every run launched from this frontend.
 *
 * Otherwise (runs created through the API with bias counts above the edge count) the requested
 * density is ambiguous: the fallback is the smallest density that gives `m` under the current
 * `densityFactor`, `ceil(m / densityFactor)`, flagged `exact: false`.
 */
export function recoverRequestedDensity(
  effectiveDensity: number,
  agentsPerNetwork: number,
  biasTotal: number,
  densityFactor: number,
): { density: number; exact: boolean } {
  const n = agentsPerNetwork;
  const b = 2 * n - 1;
  const discriminant = b * b - 4 * biasTotal;
  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const d = (b - root) / 2;
    if (
      Number.isInteger(d) &&
      d >= effectiveDensity &&
      d >= 1 &&
      d < n &&
      computeMaxEdges(d, n) === biasTotal
    ) {
      return { density: d, exact: true };
    }
  }

  if (!(densityFactor > 0) || !Number.isFinite(densityFactor)) {
    return { density: effectiveDensity, exact: false };
  }
  let d = Math.max(1, Math.ceil(effectiveDensity / densityFactor));
  // Float safety: step to the smallest density that still gives the effective density.
  while (d > 1 && effectiveDensityOf(d - 1, densityFactor, n) >= effectiveDensity) d -= 1;
  while (d < n - 1 && effectiveDensityOf(d, densityFactor, n) < effectiveDensity) d += 1;
  return { density: d, exact: false };
}

/** What the wizard is pre-filled with when a generated run is re-launched from the history. */
export interface RelaunchPrefill {
  values: GeneratedSimFormValues;
  /** False when the requested density had to be estimated (see recoverRequestedDensity). */
  densityExact: boolean;
  /** Effective density the pre-filled density gives with the CURRENT quotas. */
  effectiveNow: number;
  /** False when the stored seed is outside 0 … 2^53 − 1: the wizard cannot hold it (seed null). */
  seedKept: boolean;
}

/** A stored seed the wizard can hold exactly: a decimal whole number in `[0, MAX_SEED]`. */
function wizardSeed(seed: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(seed)) return null;
  const value = Number(seed);
  return Number.isSafeInteger(value) && value <= MAX_SEED ? value : null;
}

/**
 * Wizard values rebuilding the request of a stored generated run (#127): same agents, networks,
 * iterations, stop threshold, agent-type and bias rows (in the canonical order the backend gives
 * the simulator) and seed, so launching them as they are replays the run. `persistFrames` /
 * `frameRetention` are not part of the form: the wizard always sends its defaults (frames
 * persisted, ephemeral retention), whatever the original run used.
 */
export function relaunchPrefill(
  config: GeneratedRunConfig,
  densityFactor: number,
): RelaunchPrefill {
  const n = config.agentsPerNetwork;
  const biasTotal = config.biasTypes.reduce((sum, row) => sum + row.count, 0);
  const { density, exact } = recoverRequestedDensity(
    config.effectiveDensity,
    n,
    biasTotal,
    densityFactor,
  );
  const seed = wizardSeed(config.seed);

  return {
    values: {
      networkType: "generated",
      numberOfAgents: n,
      numberOfNetworks: config.numberOfNetworks,
      density,
      iterationLimit: config.iterationLimit,
      stopThreshold: config.stopThreshold,
      seed,
      saveMode: RUN_SAVE_MODE,
      agentTypes: config.agentTypes.map((row, i) => ({
        id: `relaunch-a${i}`,
        count: row.count,
        silenceStrategy: row.silenceStrategy,
        silenceEffect: row.silenceEffect,
      })),
      biasTypes: config.biasTypes.map((row, i) => ({
        id: `relaunch-b${i}`,
        count: row.count,
        cognitiveBias: row.biasType,
      })),
    },
    densityExact: exact,
    effectiveNow: effectiveDensityOf(density, densityFactor, n),
    seedKept: seed !== null,
  };
}
