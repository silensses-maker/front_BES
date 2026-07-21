import { z } from "zod";

export function computeMaxEdges(density: number, numberOfAgents: number): number {
  if (numberOfAgents < density) return 0;
  return density * (density - 1) + (numberOfAgents - density) * 2 * density;
}

// ─── Custom simulation sub-schemas ────────────────────────────────────────────

const customAgentSchema = z.object({
  name: z.string().min(1),
  belief: z.number().min(0).max(1),
  toleranceRadius: z.number().min(0).max(1),
  toleranceOffset: z.number().min(-1).max(1),
  silenceStrategy: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  silenceEffect: z.union([z.literal(0), z.literal(1)]),
});

const customEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  influence: z.number().min(0).max(1),
  bias: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

const agentTypeRowSchema = z.object({
  id: z.string(),
  count: z.number().int().min(1),
  silenceStrategy: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  silenceEffect: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  majorityThreshold: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const biasRowSchema = z.object({
  id: z.string(),
  count: z.number().int().min(1),
  cognitiveBias: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
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
    networkName: z.string().min(1),
    iterationLimit: z.number().int().min(1),
    stopThreshold: z.number().gt(0).lt(1),
    saveMode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    agents: z.array(customAgentSchema).min(1),
    edges: z.array(customEdgeSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const agentNames = new Set(data.agents.map((a) => a.name));
    const seenDirections = new Set<string>();

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
