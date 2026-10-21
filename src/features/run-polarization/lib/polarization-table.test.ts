import { describe, expect, it } from "vitest";
import {
  type RoundSource,
  revealScrollTop,
  roundIndex,
  rowInView,
  SEEK_JUMP_ROUNDS,
  shouldReveal,
  tableCell,
  tableRounds,
  visibleWindow,
} from "./polarization-table";

/**
 * A series' answers: `values[round]` is a number (value), null (no value), a string (the package's
 * error) or undefined (not answered yet).
 */
function source(values: Array<number | null | string | undefined>, levels: string[] = []) {
  const answered = (round: number) => round >= 0 && values[round] !== undefined;
  const fake: RoundSource = {
    maxRound: values.reduce<number>((max, v, round) => (v === undefined ? max : round), -1),
    answeredAt: answered,
    valueAt: (round) => {
      const value = values[round];
      return typeof value === "number" ? value : null;
    },
    levelAt: (round) => levels[round] ?? null,
    errorAt: (round) => {
      const value = values[round];
      return typeof value === "string" ? value : null;
    },
  };
  return fake;
}

describe("tableRounds", () => {
  it("lists every round some series has answered, ascending", () => {
    const a = source([0.1, 0.2, undefined, 0.4]);
    const b = source([undefined, undefined, 0.3]);
    expect(tableRounds([a, b])).toEqual([0, 1, 2, 3]);
  });

  it("keeps the gaps no series has answered yet (rounds arrive in any order)", () => {
    expect(tableRounds([source([undefined, 0.5, undefined, undefined, 0.2])])).toEqual([1, 4]);
  });

  it("counts rounds answered without a value or with the package's error", () => {
    expect(tableRounds([source([null, "ValueError"])])).toEqual([0, 1]);
  });

  it("is empty without series or answers", () => {
    expect(tableRounds([])).toEqual([]);
    expect(tableRounds([null, null])).toEqual([]);
    expect(tableRounds([source([])])).toEqual([]);
  });
});

describe("tableCell", () => {
  const series = source([0.25, null, "ValueError: empty", undefined], ["low"]);

  it("a value and its level", () => {
    expect(tableCell(series, true, 0)).toEqual({ kind: "value", value: 0.25, level: "low" });
  });

  it("a computed round without a value, with or without the package's error", () => {
    expect(tableCell(series, true, 1)).toEqual({ kind: "none" });
    expect(tableCell(series, true, 2)).toEqual({ kind: "error", message: "ValueError: empty" });
  });

  it("a round not computed yet, or a column without a series", () => {
    expect(tableCell(series, true, 3)).toEqual({ kind: "pending" });
    expect(tableCell(series, true, 99)).toEqual({ kind: "pending" });
    expect(tableCell(null, true, 0)).toEqual({ kind: "pending" });
  });

  it("a measure not defined for the column's k", () => {
    expect(tableCell(null, false, 0)).toEqual({ kind: "unsupported" });
    expect(tableCell(series, false, 0)).toEqual({ kind: "unsupported" });
  });
});

describe("roundIndex", () => {
  it("finds a listed round by binary search, -1 otherwise", () => {
    const rounds = [0, 1, 4, 7, 9, 12];
    expect(rounds.map((round) => roundIndex(rounds, round))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(roundIndex(rounds, 5)).toBe(-1);
    expect(roundIndex(rounds, -1)).toBe(-1);
    expect(roundIndex(rounds, 13)).toBe(-1);
    expect(roundIndex([], 0)).toBe(-1);
  });
});

describe("visibleWindow", () => {
  const base = { rowHeight: 20, viewportHeight: 100, overscan: 2 };

  it("renders the visible rows plus the overscan; spacers stand for the rest", () => {
    expect(visibleWindow({ ...base, count: 1000, scrollTop: 0 })).toEqual({
      start: 0,
      end: 8,
      padTop: 0,
      padBottom: 992 * 20,
    });
    // Scrolled to row 50: rows 48 … 57 rendered
    expect(visibleWindow({ ...base, count: 1000, scrollTop: 1000 })).toEqual({
      start: 48,
      end: 58,
      padTop: 48 * 20,
      padBottom: 942 * 20,
    });
  });

  it("stops at the last row and handles short or empty tables", () => {
    expect(visibleWindow({ ...base, count: 1000, scrollTop: 19_990 })).toMatchObject({
      end: 1000,
      padBottom: 0,
    });
    expect(visibleWindow({ ...base, count: 3, scrollTop: 0 })).toEqual({
      start: 0,
      end: 3,
      padTop: 0,
      padBottom: 0,
    });
    expect(visibleWindow({ ...base, count: 0, scrollTop: 500 })).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });

  it("clamps a negative scroll (overscroll) and a viewport not measured yet", () => {
    expect(visibleWindow({ ...base, count: 10, scrollTop: -50 }).start).toBe(0);
    expect(visibleWindow({ ...base, count: 10, scrollTop: 0, viewportHeight: -1 }).end).toBe(3);
  });
});

describe("following the playhead", () => {
  // Header 30, rows 20, viewport 130: rows 0 … 4 fit under the header at scrollTop 0
  const view = { rowHeight: 20, headerHeight: 30, viewportHeight: 130 };

  it("knows whether a row is entirely visible below the sticky header", () => {
    expect(rowInView({ ...view, index: 0, scrollTop: 0 })).toBe(true);
    expect(rowInView({ ...view, index: 4, scrollTop: 0 })).toBe(true);
    expect(rowInView({ ...view, index: 5, scrollTop: 0 })).toBe(false);
    // Scrolled by 10: row 0 is half under the header
    expect(rowInView({ ...view, index: 0, scrollTop: 10 })).toBe(false);
  });

  it("scrolls as little as possible: to the top under the header, or to the bottom", () => {
    expect(revealScrollTop({ ...view, index: 2, scrollTop: 0 })).toBeNull();
    // Below: its bottom at the viewport's bottom
    expect(revealScrollTop({ ...view, index: 10, scrollTop: 0 })).toBe(30 + 11 * 20 - 130);
    // Above: its top right under the header
    expect(revealScrollTop({ ...view, index: 3, scrollTop: 400 })).toBe(60);
    expect(revealScrollTop({ ...view, index: -1, scrollTop: 0 })).toBeNull();
  });

  it("reveals on a seek (backwards or a jump), and during playback only while following", () => {
    expect(shouldReveal(true, 10, 11)).toBe(true);
    expect(shouldReveal(false, null, 11)).toBe(true);
    expect(shouldReveal(false, 10, 11)).toBe(false);
    expect(shouldReveal(false, 10, 10 + SEEK_JUMP_ROUNDS)).toBe(false);
    expect(shouldReveal(false, 10, 11 + SEEK_JUMP_ROUNDS)).toBe(true);
    expect(shouldReveal(false, 10, 3)).toBe(true);
  });
});
