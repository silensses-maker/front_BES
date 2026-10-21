/**
 * Chart colors from the theme tokens (#129). The tokens are `oklch(…)`, which ECharts' color
 * parser does not understand, so each token is resolved to sRGB by painting it on a 1×1 canvas
 * and reading the pixel back. Consumers re-read the theme when the root element's class flips
 * (light ↔ dark) — see `useChartTheme`.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ChartTheme {
  /** Series colors. */
  public: string;
  private: string;
  participation: string;
  polarization: string;
  /**
   * Categorical palette of comparison charts (one color per compared series, in this order):
   * chart-4 (the single-series color) then chart-6, chart-7 and chart-8. It leaves out chart-1 and
   * chart-2, which mean public and private beliefs. More series reuse these four colors with
   * dashed and dotted lines (run-polarization's series-style.ts).
   */
  series: readonly string[];
  /** Text, axis and grid colors. */
  text: string;
  axisLine: string;
  grid: string;
  playhead: string;
  thresholds: string;
  tooltipBackground: string;
  tooltipText: string;
  tooltipBorder: string;
  /** Resolved base RGB of every token, for alpha variants and equality checks. */
  key: string;
}

/** Mockup's light-mode colors: used when a token cannot be resolved (no canvas, SSR, tests). */
const FALLBACK: Readonly<Record<string, Rgb>> = {
  "--chart-1": { r: 79, g: 107, b: 216 },
  "--chart-2": { r: 124, g: 179, b: 66 },
  "--chart-4": { r: 142, g: 68, b: 214 },
  "--chart-6": { r: 234, g: 106, b: 9 },
  "--chart-7": { r: 151, g: 7, b: 103 },
  "--chart-8": { r: 120, g: 101, b: 0 },
  "--warn": { r: 201, g: 138, b: 46 },
  "--muted-foreground": { r: 88, g: 98, b: 130 },
  "--foreground": { r: 30, g: 39, b: 72 },
  "--popover": { r: 255, g: 255, b: 255 },
  "--border": { r: 228, g: 228, b: 231 },
};

let probe: CanvasRenderingContext2D | null | undefined;

function probeContext(): CanvasRenderingContext2D | null {
  if (probe !== undefined) return probe;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    probe = null;
  }
  return probe ?? null;
}

/** Test seam: forget the cached probe context. */
export function resetColorProbe(): void {
  probe = undefined;
}

/** Resolves any CSS color (oklch included) to sRGB, or null when it cannot be painted. */
export function resolveCssColor(value: string): Rgb | null {
  const color = value.trim();
  if (color === "") return null;
  if (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    !CSS.supports("color", color)
  ) {
    return null;
  }
  const ctx = probeContext();
  if (ctx === null) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === undefined || a === 0) return null;
  return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
}

export function rgba({ r, g, b }: Rgb, alpha = 1): string {
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readToken(style: CSSStyleDeclaration | null, name: string): Rgb {
  const value = style?.getPropertyValue(name) ?? "";
  return resolveCssColor(value) ?? (FALLBACK[name] as Rgb);
}

/** Reads the chart palette from the current theme tokens. */
export function readChartTheme(): ChartTheme {
  let style: CSSStyleDeclaration | null = null;
  try {
    style = getComputedStyle(document.documentElement);
  } catch {
    style = null;
  }
  const chart1 = readToken(style, "--chart-1");
  const chart2 = readToken(style, "--chart-2");
  const chart4 = readToken(style, "--chart-4");
  const chart6 = readToken(style, "--chart-6");
  const chart7 = readToken(style, "--chart-7");
  const chart8 = readToken(style, "--chart-8");
  const warn = readToken(style, "--warn");
  const muted = readToken(style, "--muted-foreground");
  const foreground = readToken(style, "--foreground");
  const popover = readToken(style, "--popover");
  const border = readToken(style, "--border");
  const key = [
    chart1,
    chart2,
    chart4,
    chart6,
    chart7,
    chart8,
    warn,
    muted,
    foreground,
    popover,
    border,
  ]
    .map(({ r, g, b }) => `${r},${g},${b}`)
    .join(";");
  return {
    public: rgba(chart1),
    private: rgba(chart2),
    participation: rgba(warn),
    polarization: rgba(chart4),
    series: [rgba(chart4), rgba(chart6), rgba(chart7), rgba(chart8)],
    text: rgba(muted, 0.9),
    axisLine: rgba(muted, 0.35),
    grid: rgba(muted, 0.12),
    playhead: rgba(muted, 0.5),
    thresholds: rgba(muted, 0.45),
    tooltipBackground: rgba(popover),
    tooltipText: rgba(foreground),
    tooltipBorder: rgba(border),
    key,
  };
}
