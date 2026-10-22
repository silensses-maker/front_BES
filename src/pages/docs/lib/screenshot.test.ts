import { describe, expect, it } from "vitest";
import { isScreenshotName, screenshotSrc, screenshotTheme } from "./screenshot";

describe("manual screenshots", () => {
  it.each([
    ["login", true],
    ["run-view-graph", true],
    ["charts-2", true],
    ["Run-View", false],
    ["run_view", false],
    ["run--view", false],
    ["-run", false],
    ["run-", false],
    ["../secret", false],
    ["", false],
  ])("accepts %j as a slot name: %s", (name, valid) => {
    expect(isScreenshotName(name)).toBe(valid);
  });

  it("reads only the dark theme as dark", () => {
    expect(screenshotTheme("dark")).toBe("dark");
    expect(screenshotTheme("light")).toBe("light");
    expect(screenshotTheme("system")).toBe("light");
    expect(screenshotTheme(undefined)).toBe("light");
  });

  it("serves each slot per language and theme from public/docs", () => {
    expect(screenshotSrc("login", "es", "light")).toBe("/docs/es/light/login.webp");
    expect(screenshotSrc("run-view-graph", "en", "dark")).toBe("/docs/en/dark/run-view-graph.webp");
  });

  it("rejects a name that is not a slot name", () => {
    expect(() => screenshotSrc("../login", "en", "light")).toThrow(/Invalid screenshot name/);
  });
});
