import type { SilenceStrategy } from "../types/simulation-config.types";

/**
 * i18n key of the read-only hint shown next to a silence strategy whose
 * parameters are fixed by the simulator, or `null` when there is nothing to
 * say (DeGroot, Majority).
 *
 * The backend sets them itself when a network starts (AgentProcessor
 * `FirstUpdate`, for generated and custom runs alike): THRESHOLD agents get a
 * threshold of 0.1; CONFIDENCE agents get a random initial confidence and a
 * threshold of 0.1. The API has no fields for these values, so the wizard
 * does not ask for them (#120).
 */
export function fixedStrategyHintKey(
  strategy: SilenceStrategy,
): "simulationConfig.thresholdFixedHint" | "simulationConfig.confidenceFixedHint" | null {
  if (strategy === 2) return "simulationConfig.thresholdFixedHint";
  if (strategy === 3) return "simulationConfig.confidenceFixedHint";
  return null;
}
