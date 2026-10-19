import { describe, expect, it } from "vitest";
import { LLM_NETWORK_PROMPT } from "./llm-prompt";
import type { CustomSimSchemaInput } from "./validation";
import { customSimSchema, generatedSimSchema } from "./validation";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pulls the JSON object that follows a `Worked example — "<label>"` header.
 * The object starts at the first column-0 `{` after the header and ends at the
 * next column-0 `}` (nested rows are always indented in the prompt).
 */
function extractWorkedExample(label: string): unknown {
  const header = LLM_NETWORK_PROMPT.indexOf(`Worked example — "${label}"`);
  expect(header).toBeGreaterThan(-1);

  const open = LLM_NETWORK_PROMPT.indexOf("\n{\n", header);
  const close = LLM_NETWORK_PROMPT.indexOf("\n}\n", open);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);

  return JSON.parse(LLM_NETWORK_PROMPT.slice(open + 1, close + 2));
}

// ─── Worked examples stay in sync with the validation schemas ────────────────

describe("LLM_NETWORK_PROMPT worked examples", () => {
  it("generated example passes generatedSimSchema", () => {
    const result = generatedSimSchema.safeParse(extractWorkedExample("generated"));
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it("custom example passes customSimSchema", () => {
    const result = customSimSchema.safeParse(extractWorkedExample("custom"));
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it("custom example keeps networkName and agent names within 32 characters", () => {
    const example = extractWorkedExample("custom") as CustomSimSchemaInput;
    expect(example.networkName.length).toBeLessThanOrEqual(32);
    for (const agent of example.agents) {
      expect(agent.name.length).toBeLessThanOrEqual(32);
    }
  });
});

// ─── Simulator-fixed values and full custom enums (#120) ─────────────────────

describe("LLM_NETWORK_PROMPT field documentation", () => {
  it("does not document majorityThreshold / confidence as JSON fields", () => {
    expect(LLM_NETWORK_PROMPT).not.toMatch(/"majorityThreshold"\s*:/);
    expect(LLM_NETWORK_PROMPT).not.toMatch(/"confidence"\s*:/);
    expect(LLM_NETWORK_PROMPT).not.toMatch(/required when silenceStrategy/);
  });

  it("states the values the simulator fixes", () => {
    expect(LLM_NETWORK_PROMPT).toContain("fixed fraction, 0.1");
    expect(LLM_NETWORK_PROMPT).toContain("random confidence");
  });

  it("no longer restricts the custom shape to a subset of the enums", () => {
    expect(LLM_NETWORK_PROMPT).not.toContain("NOT available");
    const customShape = LLM_NETWORK_PROMPT.slice(LLM_NETWORK_PROMPT.indexOf('SHAPE 2 — "custom"'));
    expect(customShape).toContain('"silenceStrategy": <0 | 1 | 2 | 3>');
    expect(customShape).toContain('"silenceEffect": <0 | 1 | 2>');
    expect(customShape).toContain('"bias": <0 | 1 | 2 | 3 | 4>');
  });

  it("worked examples carry no threshold/confidence keys", () => {
    const generated = extractWorkedExample("generated") as {
      agentTypes: Record<string, unknown>[];
    };
    for (const row of generated.agentTypes) {
      expect(row).not.toHaveProperty("majorityThreshold");
      expect(row).not.toHaveProperty("confidence");
    }
  });
});

// ─── saveMode is accepted but ignored (#133) ─────────────────────────────────

describe("LLM_NETWORK_PROMPT saveMode", () => {
  it("marks saveMode as currently ignored in both shapes", () => {
    const saveModeLines = LLM_NETWORK_PROMPT.split("\n").filter((line) =>
      line.includes('"saveMode": <0 | 1 | 2>'),
    );
    expect(saveModeLines).toHaveLength(2);
    for (const line of saveModeLines) {
      expect(line).toContain("currently IGNORED");
    }
  });

  it("worked examples still carry a valid saveMode", () => {
    for (const label of ["generated", "custom"]) {
      expect(extractWorkedExample(label)).toHaveProperty("saveMode", 1);
    }
  });
});
