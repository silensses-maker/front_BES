import type {
  GeneratedSimFormValues,
  SimConfigValidationErrors,
} from "../types/simulation-config.types";

/**
 * Pure helpers for the "Resumen en vivo" panel (and the review error panel).
 * Kept out of the components so the math and the error→i18n mapping are
 * unit-testable and shared between the sidebar and the main area.
 */

export interface CompositionEntry {
  /** i18n label key for the group (strategy or bias) */
  labelKey: string;
  count: number;
  /** Percentage over the SUM OF ROWS (mockup semantics), 1 decimal. */
  pct: number;
}

const STRATEGY_LABEL_KEYS: Record<number, string> = {
  0: "simulationConfig.strategyDegroot",
  1: "simulationConfig.strategyMajority",
  2: "simulationConfig.strategyThreshold",
  3: "simulationConfig.strategyConfidence",
};

const BIAS_LABEL_KEYS: Record<number, string> = {
  0: "simulationConfig.biasNone",
  1: "simulationConfig.biasConfirmation",
  2: "simulationConfig.biasBackfire",
  3: "simulationConfig.biasAuthority",
  4: "simulationConfig.biasInsular",
};

function buildComposition(
  rows: Array<{ group: number; count: number }>,
  labelKeys: Record<number, string>,
): CompositionEntry[] {
  const grouped = new Map<number, number>();
  for (const row of rows) {
    grouped.set(row.group, (grouped.get(row.group) ?? 0) + row.count);
  }
  const total = [...grouped.values()].reduce((sum, n) => sum + n, 0) || 1;
  return [...grouped.entries()].map(([group, count]) => ({
    labelKey: labelKeys[group] ?? String(group),
    count,
    pct: Number(((count / total) * 100).toFixed(1)),
  }));
}

/** Groups agent-type rows by silence strategy (mockup groups by label). */
export function buildAgentComposition(gen: GeneratedSimFormValues): CompositionEntry[] {
  return buildComposition(
    gen.agentTypes.map((r) => ({ group: r.silenceStrategy, count: r.count })),
    STRATEGY_LABEL_KEYS,
  );
}

/** Groups bias rows by cognitive bias. */
export function buildBiasComposition(gen: GeneratedSimFormValues): CompositionEntry[] {
  return buildComposition(
    gen.biasTypes.map((r) => ({ group: r.cognitiveBias, count: r.count })),
    BIAS_LABEL_KEYS,
  );
}

/** Fixed stub width for unlimited quotas (mockup renders an 8% sliver). */
export const UNLIMITED_METER_STUB = 8;

export function quotaMeterPct(used: number, limit: number | null): number {
  if (limit === null || !Number.isFinite(limit) || limit <= 0) return UNLIMITED_METER_STUB;
  return Math.min(100, (used / limit) * 100);
}

export function isOverQuota(used: number, limit: number | null): boolean {
  if (limit === null || !Number.isFinite(limit)) return false;
  return used > limit;
}

export interface ValidationMessage {
  key: string;
  params?: Record<string, string | number>;
}

export interface ValidationMessageContext {
  requested?: string;
  limit?: string;
  iterationLimit?: string;
  expected?: string;
  actual?: string;
  bias?: string;
  maxEdges?: string;
}

/**
 * Maps validation error flags to i18n messages with interpolation — the single
 * source used by the Validación card, the review error panel, and any future
 * consumer, so all surfaces show identical copy in a stable order.
 */
export function listValidationMessages(
  errors: SimConfigValidationErrors,
  ctx: ValidationMessageContext = {},
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const push = (key: string, params?: Record<string, string | number>) =>
    messages.push(params ? { key, params } : { key });

  if (errors.customNetworkNameEmpty) push("simulationConfig.errorCustomNetworkNameEmpty");
  if (errors.agentLimitExceeded)
    push("simulationConfig.errorAgentLimit", {
      requested: ctx.requested ?? "",
      limit: ctx.limit ?? "",
    });
  if (errors.iterationLimitExceeded)
    push("simulationConfig.errorIterationLimit", { limit: ctx.iterationLimit ?? ctx.limit ?? "" });
  if (errors.stopThresholdOutOfRange) push("simulationConfig.errorStopThreshold");
  if (errors.agentCountMismatch)
    push("simulationConfig.errorAgentCountMismatch", {
      actual: ctx.actual ?? "",
      expected: ctx.expected ?? "",
    });
  if (errors.biasCountMismatch)
    push("simulationConfig.errorBiasMismatch", {
      bias: ctx.bias ?? "",
      maxEdges: ctx.maxEdges ?? "",
    });
  if (errors.customNoAgents) push("simulationConfig.errorCustomNoAgents");
  if (errors.customNoEdges) push("simulationConfig.errorCustomNoEdges");
  if (errors.customAgentInvalid) push("simulationConfig.errorCustomAgentInvalid");
  if (errors.customEdgeInvalid) push("simulationConfig.errorCustomEdgeInvalid");
  if (errors.customEdgeUnknownAgent) push("simulationConfig.errorCustomEdgeUnknownAgent");
  if (errors.customEdgeDuplicate) push("simulationConfig.errorCustomEdgeDuplicate");
  if (errors.countsInvalid) push("simulationConfig.errorCountsInvalid");
  if (errors.importInvalid) push("simulationConfig.errorImportInvalid");

  return messages;
}

/** Locale-aware number formatting (mockup's fmt: es-CO grouping "1.068"). */
export function formatNumber(n: number, lang: string): string {
  if (!Number.isFinite(n)) return "∞";
  return n.toLocaleString(lang);
}
