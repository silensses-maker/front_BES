import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  axisStyle,
  axisTooltip,
  legendStyle,
  playheadMarkLine,
  timeAxis,
  valueAxis,
} from "./chart-options";
import { readChartTheme, resetColorProbe, resolveCssColor, rgba } from "./chart-theme";

/** A 2D context stub that "paints" known colors to fixed pixels. */
function stubCanvas(pixels: Record<string, [number, number, number, number]>) {
  let fill = "";
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    set fillStyle(value: string) {
      fill = value;
    },
    get fillStyle() {
      return fill;
    },
    getImageData: () => ({ data: pixels[fill] ?? [0, 0, 0, 0] }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  return ctx;
}

describe("resolveCssColor", () => {
  beforeEach(() => resetColorProbe());
  afterEach(() => {
    vi.restoreAllMocks();
    resetColorProbe();
  });

  it("paints the color and reads the pixel back as sRGB", () => {
    stubCanvas({ "oklch(0.5 0.1 264)": [10, 20, 30, 255] });
    expect(resolveCssColor(" oklch(0.5 0.1 264) ")).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("returns null for empty, unsupported or transparent colors and without a canvas", () => {
    stubCanvas({ transparent: [0, 0, 0, 0] });
    expect(resolveCssColor("")).toBeNull();
    expect(resolveCssColor("transparent")).toBeNull();
    const supports = vi.spyOn(CSS, "supports").mockReturnValue(false);
    expect(resolveCssColor("not-a-color")).toBeNull();
    supports.mockRestore();

    vi.restoreAllMocks();
    resetColorProbe();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(resolveCssColor("red")).toBeNull();
  });

  it("survives a canvas that throws", () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("no canvas");
    });
    expect(resolveCssColor("red")).toBeNull();
  });
});

describe("readChartTheme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetColorProbe();
    document.documentElement.removeAttribute("style");
  });

  it("falls back to the mockup's light palette when tokens cannot be resolved", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    resetColorProbe();
    const theme = readChartTheme();
    expect(theme.public).toBe("rgb(79, 107, 216)");
    expect(theme.private).toBe("rgb(124, 179, 66)");
    expect(theme.participation).toBe("rgb(201, 138, 46)");
    expect(theme.grid).toBe("rgba(88, 98, 130, 0.12)");
    expect(theme.playhead).toBe("rgba(88, 98, 130, 0.5)");
    expect(theme.key).toContain("79,107,216");
  });

  it("has a comparison palette: the single-series color first, never public / private", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    resetColorProbe();
    const theme = readChartTheme();
    expect(theme.series).toEqual([
      theme.polarization,
      "rgb(234, 106, 9)",
      "rgb(151, 7, 103)",
      "rgb(120, 101, 0)",
    ]);
    expect(new Set(theme.series).size).toBe(4);
    expect(theme.series).not.toContain(theme.public);
    expect(theme.series).not.toContain(theme.private);
    expect(theme.key).toContain("234,106,9");
  });

  it("resolves the theme tokens of the root element", () => {
    document.documentElement.style.setProperty("--chart-1", "oklch(0.63 0.16 264)");
    document.documentElement.style.setProperty("--muted-foreground", "oklch(0.6 0.03 264)");
    stubCanvas({
      "oklch(0.63 0.16 264)": [110, 130, 240, 255],
      "oklch(0.6 0.03 264)": [150, 160, 190, 255],
    });
    resetColorProbe();
    const theme = readChartTheme();
    expect(theme.public).toBe("rgb(110, 130, 240)");
    expect(theme.text).toBe("rgba(150, 160, 190, 0.9)");
    // Unset tokens keep their fallback
    expect(theme.private).toBe("rgb(124, 179, 66)");
  });

  it("formats rgb / rgba", () => {
    expect(rgba({ r: 1, g: 2, b: 3 })).toBe("rgb(1, 2, 3)");
    expect(rgba({ r: 1, g: 2, b: 3 }, 0.5)).toBe("rgba(1, 2, 3, 0.5)");
  });
});

describe("chart option fragments", () => {
  const theme = readChartTheme();

  it("themes axes, legend, playhead and tooltip", () => {
    expect(axisStyle(theme).axisLabel.color).toBe(theme.text);
    expect(axisStyle(theme).splitLine.lineStyle.color).toBe(theme.grid);
    expect(timeAxis(theme)).toMatchObject({ type: "value", min: 0 });
    expect(valueAxis(theme, { min: 0, max: 1 })).toMatchObject({ min: 0, max: 1 });
    const formatter = (v: number) => `${v}%`;
    expect(valueAxis(theme, { formatter }).axisLabel.formatter).toBe(formatter);
    expect(valueAxis(theme).axisLabel).not.toHaveProperty("formatter");
    expect(playheadMarkLine(7, theme)).toMatchObject({
      data: [{ xAxis: 7 }],
      lineStyle: { color: theme.playhead, type: "dashed" },
    });
    expect(legendStyle(theme).textStyle.color).toBe(theme.text);
    expect(axisTooltip(theme)).toMatchObject({
      trigger: "axis",
      backgroundColor: theme.tooltipBackground,
    });
    expect(axisTooltip(theme, () => "x")).toHaveProperty("formatter");
  });
});
