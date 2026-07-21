import { describe, expect, it } from "vitest";
import { interpolateOpinion, OPINION_PALETTE } from "./opinion-palette";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("interpolateOpinion", () => {
  it("returns the low-pole color at value 0", () => {
    // OPINION_PALETTE[0] = #ef4444 → rgb(239, 68, 68)
    expect(interpolateOpinion(0)).toBe("rgb(239, 68, 68)");
  });

  it("returns the neutral midpoint color at value 0.5", () => {
    // OPINION_PALETTE[1] = #94a3b8 → rgb(148, 163, 184)
    expect(interpolateOpinion(0.5)).toBe("rgb(148, 163, 184)");
  });

  it("returns the high-pole color at value 1", () => {
    // OPINION_PALETTE[2] = #3b82f6 → rgb(59, 130, 246)
    expect(interpolateOpinion(1)).toBe("rgb(59, 130, 246)");
  });

  it("interpolates between low and neutral at 0.25", () => {
    // Halfway between #ef4444 (239,68,68) and #94a3b8 (148,163,184).
    expect(interpolateOpinion(0.25)).toBe("rgb(194, 116, 126)");
  });

  it("interpolates between neutral and high at 0.75", () => {
    // Halfway between #94a3b8 (148,163,184) and #3b82f6 (59,130,246).
    expect(interpolateOpinion(0.75)).toBe("rgb(104, 147, 215)");
  });

  it("clamps values below 0 to the low-pole color", () => {
    expect(interpolateOpinion(-0.5)).toBe(interpolateOpinion(0));
  });

  it("clamps values above 1 to the high-pole color", () => {
    expect(interpolateOpinion(2)).toBe(interpolateOpinion(1));
  });

  it("keeps OPINION_PALETTE as the canonical 3-stop bipolar scale", () => {
    expect(OPINION_PALETTE).toEqual(["#ef4444", "#94a3b8", "#3b82f6"]);
  });
});
