import { describe, expect, it } from "vitest";
import {
  DIVERGENCE_PALETTE,
  interpolateDivergence,
  interpolateOpinion,
  OPINION_PALETTE,
} from "./opinion-palette";

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

describe("interpolateDivergence", () => {
  it("maps 0 to the slate low end", () => {
    expect(interpolateDivergence(0)).toBe("rgb(148, 163, 184)");
  });

  it("saturates at 0.2 to the violet high end", () => {
    expect(interpolateDivergence(0.2)).toBe("rgb(168, 85, 247)");
    expect(interpolateDivergence(0.9)).toBe("rgb(168, 85, 247)");
  });

  it("interpolates halfway at 0.1 (t = 0.5)", () => {
    // Halfway between #94a3b8 (148,163,184) and #a855f7 (168,85,247)
    expect(interpolateDivergence(0.1)).toBe("rgb(158, 124, 216)");
  });

  it("clamps negatives to the low end", () => {
    expect(interpolateDivergence(-1)).toBe(interpolateDivergence(0));
  });

  it("keeps DIVERGENCE_PALETTE as the canonical slate→violet scale", () => {
    expect(DIVERGENCE_PALETTE).toEqual(["#94a3b8", "#a855f7"]);
  });
});
