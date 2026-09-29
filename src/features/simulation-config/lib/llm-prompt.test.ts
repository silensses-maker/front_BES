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
