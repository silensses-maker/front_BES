import { describe, expect, it } from "vitest";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { fixedStrategyHintKey } from "./fixed-strategy-hint";

describe("fixedStrategyHintKey (#120)", () => {
  it("returns no hint for DeGroot (0) and Majority (1)", () => {
    expect(fixedStrategyHintKey(0)).toBeNull();
    expect(fixedStrategyHintKey(1)).toBeNull();
  });

  it("returns the threshold hint for Threshold (2)", () => {
    expect(fixedStrategyHintKey(2)).toBe("simulationConfig.thresholdFixedHint");
  });

  it("returns the confidence hint for Confidence (3)", () => {
    expect(fixedStrategyHintKey(3)).toBe("simulationConfig.confidenceFixedHint");
  });

  it("points to keys that exist in both locales and state the fixed 0.1 threshold", () => {
    for (const strategy of [2, 3] as const) {
      const key = fixedStrategyHintKey(strategy);
      const leaf = key?.split(".")[1] as keyof typeof en.simulationConfig;
      expect(en.simulationConfig[leaf]).toContain("0.1");
      expect(es.simulationConfig[leaf as keyof typeof es.simulationConfig]).toContain("0.1");
    }
  });
});
