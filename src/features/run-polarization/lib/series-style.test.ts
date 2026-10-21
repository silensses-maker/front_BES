import { describe, expect, it } from "vitest";
import {
  dashGeometry,
  echartsLineStyle,
  LINE_WIDTH,
  MARKERS_PER_LINE,
  markerPhase,
  markerPoints,
  SERIES_COLORS,
  sampleShape,
  slotStyle,
} from "./series-style";

describe("slotStyle (slot → colour and line style)", () => {
  it("maps the ten slots to 4 colours × solid / dashed / dotted", () => {
    expect(SERIES_COLORS).toBe(4);
    expect(Array.from({ length: 10 }, (_, slot) => slotStyle(slot))).toEqual([
      { colorIndex: 0, dash: "solid" },
      { colorIndex: 1, dash: "solid" },
      { colorIndex: 2, dash: "solid" },
      { colorIndex: 3, dash: "solid" },
      { colorIndex: 0, dash: "dashed" },
      { colorIndex: 1, dash: "dashed" },
      { colorIndex: 2, dash: "dashed" },
      { colorIndex: 3, dash: "dashed" },
      { colorIndex: 0, dash: "dotted" },
      { colorIndex: 1, dash: "dotted" },
    ]);
  });

  it("gives every slot a distinct colour and line style pair", () => {
    const pairs = Array.from({ length: 10 }, (_, slot) => {
      const style = slotStyle(slot);
      return `${style.colorIndex}:${style.dash}`;
    });
    expect(new Set(pairs).size).toBe(10);
  });

  it("draws an invalid slot like slot 0, and slots past 9 dotted", () => {
    expect(slotStyle(-1)).toEqual({ colorIndex: 0, dash: "solid" });
    expect(slotStyle(1.5)).toEqual({ colorIndex: 0, dash: "solid" });
    expect(slotStyle(Number.NaN)).toEqual({ colorIndex: 0, dash: "solid" });
    expect(slotStyle(13)).toEqual({ colorIndex: 1, dash: "dotted" });
  });
});

describe("line geometry", () => {
  it("dashes and dots for a 2 px line, markers on the dashed and dotted ones", () => {
    expect(dashGeometry("solid")).toEqual({ pattern: null, cap: "butt", marker: null });
    expect(dashGeometry("dashed")).toEqual({ pattern: [6, 3], cap: "butt", marker: "triangle" });
    expect(dashGeometry("dotted")).toEqual({ pattern: [0.5, 4], cap: "round", marker: "diamond" });
  });

  it("builds the ECharts line style (a copy of the pattern)", () => {
    expect(echartsLineStyle("red", "solid")).toEqual({
      color: "red",
      width: LINE_WIDTH,
      type: "solid",
      cap: "butt",
    });
    const dotted = echartsLineStyle("blue", "dotted");
    expect(dotted).toEqual({ color: "blue", width: 2, type: [0.5, 4], cap: "round" });
    expect(dotted.type).not.toBe(dashGeometry("dotted").pattern);
  });

  it("draws the sample with the same dash and width (two dashes, four dots)", () => {
    expect(sampleShape("solid")).toEqual({
      width: 18,
      height: 8,
      line: { x1: 1, y1: 4, x2: 17, y2: 4 },
      strokeWidth: 2,
      dasharray: null,
      cap: "butt",
    });
    expect(sampleShape("dashed")).toMatchObject({ dasharray: "6 3", cap: "butt" });
    expect(sampleShape("dotted")).toMatchObject({ dasharray: "0.5 4", cap: "round" });
  });
});

describe("markers", () => {
  const series = (length: number, gapEvery = 0): Array<[number, number | null]> =>
    Array.from({ length }, (_, round) => [
      round,
      gapEvery > 0 && round % gapEvery === gapEvery - 1 ? null : round,
    ]);

  it("gives the six marked slots six distinct phases in (0, 1)", () => {
    const phases = [4, 5, 6, 7, 8, 9].map(markerPhase);
    expect(new Set(phases).size).toBe(6);
    expect(phases.every((phase) => phase > 0 && phase < 1)).toBe(true);
    // Out of range: clamped to the first and last marked slot
    expect(markerPhase(0)).toBe(markerPhase(4));
    expect(markerPhase(12)).toBe(markerPhase(9));
  });

  it("puts between MARKERS_PER_LINE and twice as many markers on a long line", () => {
    for (const length of [13, 100, 1000, 5000, 12_345]) {
      const count = markerPoints(series(length), 0.5).length;
      expect(count).toBeGreaterThanOrEqual(MARKERS_PER_LINE);
      expect(count).toBeLessThanOrEqual(MARKERS_PER_LINE * 2);
    }
    // A short line: every point
    expect(markerPoints(series(5), 0.5)).toEqual(series(5));
    expect(markerPoints([], 0.5)).toEqual([]);
  });

  it("keeps the markers already drawn while a live run grows (until the count doubles)", () => {
    const before = markerPoints(series(1000), markerPhase(6));
    const after = markerPoints(series(1500), markerPhase(6));
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("skips gaps, and an out-of-range phase stays within the spacing", () => {
    const withGaps = markerPoints(series(10, 2), 0);
    expect(withGaps).toEqual([
      [0, 0],
      [2, 2],
      [4, 4],
      [6, 6],
      [8, 8],
    ]);
    expect(markerPoints(series(100), 5)[0]?.[0]).toBe(15); // step 16: the last offset
    expect(markerPoints(series(100), -1)[0]?.[0]).toBe(0);
  });
});
