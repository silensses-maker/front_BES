import { describe, expect, it } from "vitest";
import { decodeRunHotkey } from "./run-hotkeys";

function decode(key: string, overrides?: Partial<Parameters<typeof decodeRunHotkey>[0]>) {
  return decodeRunHotkey({
    key,
    shiftKey: false,
    targetTag: "body",
    totalRounds: 100,
    ...overrides,
  });
}

describe("decodeRunHotkey", () => {
  it("ignores keys while typing in form controls", () => {
    for (const tag of ["input", "select", "textarea"]) {
      expect(decode("ArrowRight", { targetTag: tag })).toBeNull();
      expect(decode(" ", { targetTag: tag })).toBeNull();
    }
  });

  it("steps ±1 with arrows, ×10 with Shift", () => {
    expect(decode("ArrowLeft")).toEqual({ type: "step", delta: -1 });
    expect(decode("ArrowRight")).toEqual({ type: "step", delta: 1 });
    expect(decode("ArrowLeft", { shiftKey: true })).toEqual({ type: "step", delta: -10 });
    expect(decode("ArrowRight", { shiftKey: true })).toEqual({ type: "step", delta: 10 });
  });

  it("pages by max(10, R/20)", () => {
    expect(decode("PageDown")).toEqual({ type: "step", delta: 10 }); // 100/20=5 → floor of 10
    expect(decode("PageUp", { totalRounds: 10000 })).toEqual({ type: "step", delta: -500 });
  });

  it("maps navigation and transport keys", () => {
    expect(decode("Home")).toEqual({ type: "home" });
    expect(decode("End")).toEqual({ type: "end" });
    expect(decode(" ")).toEqual({ type: "toggle-play" });
    expect(decode(",")).toEqual({ type: "event", dir: -1 });
    expect(decode(".")).toEqual({ type: "event", dir: 1 });
    expect(decode("Escape")).toEqual({ type: "escape" });
  });

  it("returns null for unmapped keys", () => {
    expect(decode("a")).toBeNull();
    expect(decode("Enter")).toBeNull();
  });
});
