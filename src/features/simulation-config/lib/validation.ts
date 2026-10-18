import { z } from "zod";
import type {
  CustomSimFormValues,
  GeneratedSimFormValues,
  SimConfigValidationErrors,
} from "../types/simulation-config.types";

export function computeMaxEdges(density: number, numberOfAgents: number): number {
  if (numberOfAgents < density) return 0;
  return density * (density - 1) + (numberOfAgents - density) * 2 * density;
}

// ─── Canonical enums (openapi.yaml, mirrored in backend.types.ts) ────────────
// Shared by the generated and custom paths: the backend accepts the full range
// on both (#120).

const silenceStrategySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const silenceEffectSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const cognitiveBiasSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

// ─── Custom simulation sub-schemas ────────────────────────────────────────────

/**
 * The backend stores the custom network name and every agent name in `varchar(32)` columns
 * and rejects longer names with 400 (#122). `.max` counts UTF-16 units, like the inputs'
 * `maxLength`, which is never laxer than the characters Postgres counts.
 */
export const MAX_CUSTOM_NAME_LENGTH = 32;

const customNameSchema = z.string().min(1).max(MAX_CUSTOM_NAME_LENGTH, "nameTooLong");

/**
 * Names used by more than one agent. The backend keys `custom_agents` by `(run_id, name)` and
 * edges refer to agents by name, so it rejects repeated names with 400 (#122). Exact,
 * case-sensitive match, like that key; empty names are left to the required-name rule.
 */
export function findDuplicateAgentNames(agents: readonly { name: string }[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { name } of agents) {
    if (name === "") continue;
    if (seen.has(name)) duplicates.add(name);
    else seen.add(name);
  }
  return duplicates;
}

const customAgentSchema = z.object({
  name: customNameSchema,
  belief: z.number().min(0).max(1),
  toleranceRadius: z.number().min(0).max(1),
  toleranceOffset: z.number().min(-1).max(1),
  silenceStrategy: silenceStrategySchema,
  silenceEffect: silenceEffectSchema,
});

const customEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  influence: z.number().min(0).max(1),
  bias: cognitiveBiasSchema,
});

// z.object strips unknown keys (non-strict), so legacy files that still carry
// `majorityThreshold` / `confidence` on a row are accepted and those keys are
// dropped from the parsed result (#120).
const agentTypeRowSchema = z.object({
  id: z.string(),
  count: z.number().int().min(1),
  silenceStrategy: silenceStrategySchema,
  silenceEffect: silenceEffectSchema,
});

const biasRowSchema = z.object({
  id: z.string(),
  count: z.number().int().min(1),
  cognitiveBias: cognitiveBiasSchema,
});

export const generatedSimSchema = z
  .object({
    networkType: z.literal("generated"),
    numberOfAgents: z.number().int().min(1),
    numberOfNetworks: z.number().int().min(1),
    density: z.number().int().min(2),
    iterationLimit: z.number().int().min(1),
    stopThreshold: z.number().gt(0).lt(1),
    seed: z.number().nullable(),
    saveMode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    agentTypes: z.array(agentTypeRowSchema).min(1),
    biasTypes: z.array(biasRowSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const totalAgents = data.agentTypes.reduce((sum, r) => sum + r.count, 0);
    const totalBias = data.biasTypes.reduce((sum, r) => sum + r.count, 0);
    const maxEdges = computeMaxEdges(data.density, data.numberOfAgents);

    if (totalAgents !== data.numberOfAgents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agentCountMismatch",
        path: ["numberOfAgents"],
      });
    }

    // Barabási–Albert: the dense core has density + 1 agents, so density must stay below
    // the agents per network — the backend rejects it with 400 otherwise (#122).
    if (data.density >= data.numberOfAgents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "densityExceedsAgents",
        path: ["density"],
      });
    }

    if (totalBias !== maxEdges) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "biasCountMismatch",
        path: ["biasTypes"],
      });
    }
  });

export type GeneratedSimSchemaInput = z.input<typeof generatedSimSchema>;

// ─── Custom simulation schema ─────────────────────────────────────────────────

export const customSimSchema = z
  .object({
    networkType: z.literal("custom"),
    networkName: customNameSchema,
    iterationLimit: z.number().int().min(1),
    stopThreshold: z.number().gt(0).lt(1),
    saveMode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    agents: z.array(customAgentSchema).min(1),
    edges: z.array(customEdgeSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const agentNames = new Set(data.agents.map((a) => a.name));
    const seenDirections = new Set<string>();

    // Every repeat (not the first use) gets an issue carrying the name, so the first one
    // reported is the same name the backend's 400 names (#122).
    const seenNames = new Set<string>();
    data.agents.forEach((agent, i) => {
      if (agent.name === "") return;
      if (seenNames.has(agent.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicateAgentName",
          path: ["agents", i, "name"],
          params: { name: agent.name },
        });
      } else {
        seenNames.add(agent.name);
      }
    });

    data.edges.forEach((edge, i) => {
      if (!agentNames.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "edgeUnknownAgent",
          path: ["edges", i, "source"],
        });
      }
      if (!agentNames.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "edgeUnknownAgent",
          path: ["edges", i, "target"],
        });
      }

      const direction = `${edge.source}→${edge.target}`;
      if (seenDirections.has(direction)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicateEdge",
          path: ["edges", i],
        });
      } else {
        seenDirections.add(direction);
      }
    });
  });

export type CustomSimSchemaInput = z.input<typeof customSimSchema>;

// ─── Form validators (shared by the wizard hook and the live summary) ─────────

/**
 * Custom networks are a single network, so only the agent and iteration quotas apply. The
 * agent count is the number of defined agents — same quota (and message) as the generated
 * path, enforced by the backend on both the JSON and the binary variants (#122).
 */
export function validateCustomForm(
  values: CustomSimFormValues,
  maxAgents?: number,
  maxIterations?: number,
): SimConfigValidationErrors {
  const errors: SimConfigValidationErrors = {};
  const result = customSimSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const msg = issue.message;
      const path = issue.path[0];
      // path[0] is "agents" / "edges" for the array itself AND for every row field
      // (["agents", i, "name"]); only the array's own min(1) has no index after it (#122).
      const inRow = issue.path.length > 1;

      if (msg === "duplicateEdge") {
        errors.customEdgeDuplicate = true;
      } else if (msg === "nameTooLong") {
        if (path === "networkName") errors.customNetworkNameTooLong = true;
        else errors.customAgentNameTooLong = true;
      } else if (msg === "duplicateAgentName") {
        errors.customAgentNameDuplicate = true;
      } else if (msg === "edgeUnknownAgent") {
        errors.customEdgeUnknownAgent = true;
      } else if (path === "networkName") {
        errors.customNetworkNameEmpty = true;
      } else if (path === "stopThreshold") {
        errors.stopThresholdOutOfRange = true;
      } else if (path === "agents") {
        if (inRow) errors.customAgentInvalid = true;
        else errors.customNoAgents = true;
      } else if (path === "edges") {
        if (inRow) errors.customEdgeInvalid = true;
        else errors.customNoEdges = true;
      } else {
        errors.countsInvalid = true;
      }
    }
  }

  if (maxAgents !== undefined && maxAgents !== null && values.agents.length > maxAgents) {
    errors.agentLimitExceeded = true;
  }

  if (
    maxIterations !== undefined &&
    maxIterations !== null &&
    values.iterationLimit > maxIterations
  ) {
    errors.iterationLimitExceeded = true;
  }

  return errors;
}

export function validateGeneratedForm(
  values: GeneratedSimFormValues,
  maxAgents: number | undefined,
  maxIterations: number | undefined,
  maxNetworks?: number,
): SimConfigValidationErrors {
  const errors: SimConfigValidationErrors = {};
  const result = generatedSimSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const msg = issue.message;
      const path = issue.path[0];

      if (msg === "agentCountMismatch") {
        errors.agentCountMismatch = true;
      } else if (msg === "biasCountMismatch") {
        errors.biasCountMismatch = true;
      } else if (msg === "densityExceedsAgents") {
        errors.densityExceedsAgents = true;
      } else if (path === "stopThreshold") {
        errors.stopThresholdOutOfRange = true;
      } else {
        errors.countsInvalid = true;
      }
    }
  }

  const totalAgents = values.agentTypes.reduce((sum, r) => sum + r.count, 0);

  if (
    maxIterations !== undefined &&
    maxIterations !== null &&
    values.iterationLimit > maxIterations
  ) {
    errors.iterationLimitExceeded = true;
  }

  if (maxAgents !== undefined && maxAgents !== null && totalAgents > maxAgents) {
    errors.agentLimitExceeded = true;
  }

  if (maxNetworks !== undefined && maxNetworks !== null && values.numberOfNetworks > maxNetworks) {
    errors.networkLimitExceeded = true;
  }

  return errors;
}

export function hasValidationErrors(errors: SimConfigValidationErrors): boolean {
  return Object.values(errors).some(Boolean);
}
