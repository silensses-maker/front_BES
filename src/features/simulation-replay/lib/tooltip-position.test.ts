import { describe, expect, it } from "vitest";
import { clampTooltipLeft } from "./tooltip-position";

describe("clampTooltipLeft", () => {
  it("centres the tooltip on the anchor when it fits", () => {
    expect(clampTooltipLeft(500, 200, 1000)).toBe(400);
  });

  it("keeps the tooltip inside the left edge", () => {
    expect(clampTooltipLeft(30, 200, 1000)).toBe(0);
  });

  it("keeps the tooltip inside the right edge (the end of the timeline)", () => {
    expect(clampTooltipLeft(995, 200, 1000)).toBe(800);
  });

  it("aligns a tooltip wider than the container to its left edge", () => {
    expect(clampTooltipLeft(100, 300, 250)).toBe(0);
  });
});
