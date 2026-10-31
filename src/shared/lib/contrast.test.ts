import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  hexToLinearSrgb,
  type LinearRgb,
  oklchContrast,
  oklchToLinearSrgb,
  parseOklch,
  relativeLuminance,
  srgbChannelToLinear,
} from "./contrast";

const hex = (value: string): LinearRgb => {
  const color = hexToLinearSrgb(value);
  if (color === null) throw new Error(`not a hex color: ${value}`);
  return color;
};

describe("parseOklch", () => {
  it("reads lightness, chroma and hue", () => {
    expect(parseOklch("oklch(0.141 0.005 285.823)")).toEqual([0.141, 0.005, 285.823]);
    expect(parseOklch("  oklch( 1   0 0 ) ")).toEqual([1, 0, 0]);
  });

  it("rejects other syntaxes", () => {
    expect(parseOklch("#ffffff")).toBeNull();
    expect(parseOklch("oklch(0.5 0.1 264")).toBeNull();
    expect(parseOklch("oklch(0.5 0.1)")).toBeNull();
    expect(parseOklch("oklch(0.5 0.1 264 / 0.5)")).toBeNull();
    expect(parseOklch("oklch(50% 0.1 264)")).toBeNull();
  });
});

describe("oklchToLinearSrgb", () => {
  it("maps the OKLab primaries back to sRGB", () => {
    const [r, g, b] = oklchToLinearSrgb(0.6279554, 0.2576833, 29.2338851);
    expect(r).toBeCloseTo(1, 3);
    expect(g).toBeCloseTo(0, 3);
    expect(b).toBeCloseTo(0, 3);
    expect(oklchToLinearSrgb(1, 0, 0).map((v) => Number(v.toFixed(4)))).toEqual([1, 1, 1]);
  });

  it("clamps out-of-gamut colors to [0, 1]", () => {
    const channels = oklchToLinearSrgb(0.7, 0.4, 150);
    for (const channel of channels) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
    expect(channels).toContain(0);
  });
});

describe("srgbChannelToLinear / hexToLinearSrgb", () => {
  it("decodes both parts of the sRGB curve", () => {
    expect(srgbChannelToLinear(0)).toBe(0);
    expect(srgbChannelToLinear(10)).toBeCloseTo(10 / 255 / 12.92, 8);
    expect(srgbChannelToLinear(255)).toBeCloseTo(1, 8);
  });

  it("reads #rgb and #rrggbb, and nothing else", () => {
    expect(hexToLinearSrgb("#fff")).toEqual(hexToLinearSrgb("#FFFFFF"));
    expect(hexToLinearSrgb("000000")).toEqual([0, 0, 0]);
    expect(hexToLinearSrgb("#12345")).toBeNull();
    expect(hexToLinearSrgb("#gggggg")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("matches WCAG's known values", () => {
    expect(contrastRatio(hex("#fff"), hex("#000"))).toBeCloseTo(21, 6);
    expect(contrastRatio(hex("#777"), hex("#fff"))).toBeCloseTo(4.48, 2);
    expect(contrastRatio(hex("#777"), hex("#777"))).toBe(1);
    expect(relativeLuminance(hex("#fff"))).toBeCloseTo(1, 8);
  });

  it("does not depend on the order", () => {
    expect(contrastRatio(hex("#000"), hex("#fff"))).toBe(contrastRatio(hex("#fff"), hex("#000")));
  });
});

describe("oklchContrast", () => {
  it("compares two oklch colors", () => {
    expect(oklchContrast("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 3);
  });

  it("is null when either color cannot be parsed", () => {
    expect(oklchContrast("red", "oklch(0 0 0)")).toBeNull();
    expect(oklchContrast("oklch(1 0 0)", "black")).toBeNull();
  });
});
