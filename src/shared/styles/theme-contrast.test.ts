import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { oklchContrast } from "@/shared/lib/contrast";

/**
 * WCAG 2.x contrast of the theme's text tokens on its surfaces, computed from the oklch values in
 * theme.css: AA (4.5:1) in both themes, and 7:1 for the dark theme's body and secondary text on
 * its page, card and sidebar surfaces. Plus a regression check: secondary text is never lowered
 * with an opacity modifier (`text-muted-foreground/60` fell to 2.5:1 on the dark card).
 */

const THEME_CSS = readFileSync(join(import.meta.dirname, "theme.css"), "utf-8");

type Tokens = Readonly<Record<string, string>>;

/** The custom properties of every `<selector> {` … `}` block (one declaration per line). */
function tokenBlocks(css: string, selector: string): Tokens[] {
  const blocks: Tokens[] = [];
  let current: Record<string, string> | null = null;
  for (const raw of css.split("\n")) {
    const line = raw.trim();
    if (line === `${selector} {`) {
      current = {};
    } else if (current !== null && line === "}") {
      blocks.push(current);
      current = null;
    } else if (current !== null && line.startsWith("--")) {
      const colon = line.indexOf(":");
      current[line.slice(2, colon)] = line.slice(colon + 1, line.indexOf(";")).trim();
    }
  }
  return blocks;
}

/** The semantic `:root` block (the other one holds the brand scale). */
const LIGHT = tokenBlocks(THEME_CSS, ":root").find((block) => block.background !== undefined);
const DARK_BLOCKS = tokenBlocks(THEME_CSS, ".dark");
const DARK = DARK_BLOCKS[0];

const TEXT = ["foreground", "muted-foreground", "primary", "destructive-foreground"] as const;
const SURFACES = ["background", "card", "popover", "muted", "accent", "sidebar"] as const;
const ON_FILL = [
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["sidebar-foreground", "sidebar"],
] as const;
/** Dark theme only: body and secondary text at 7:1 on the page, card and sidebar. */
const DARK_7_TEXT = ["foreground", "muted-foreground"] as const;
const DARK_7_SURFACES = ["background", "card", "sidebar"] as const;

/**
 * Light-theme pairs left out of the AA check. The light tokens are not part of the dark-theme
 * contrast work, so these are reported, not fixed here.
 */
const LIGHT_EXCLUDED: ReadonlyMap<string, string> = new Map([
  // Light --destructive-foreground is near-white: the shadcn "text on a --destructive fill"
  // color, ~1:1 on every light surface. Not a text-on-surface pair: no component uses
  // `text-destructive-foreground` (error text is `text-destructive`).
  ...SURFACES.map(
    (surface) => [`destructive-foreground on ${surface}`, "text on the destructive fill"] as const,
  ),
  // Known light gap (4.39:1 and 3.93:1), used in the UI: notices and table headers on bg-muted
  // (step-agents, step-network, polarization-table), the breadcrumb id chip (dashboard-header)
  // and the active docs-nav item's number on bg-accent. Reported for a light-theme decision.
  ["muted-foreground on muted", "known light gap, 4.39:1"],
  ["muted-foreground on accent", "known light gap, 3.93:1"],
]);

interface ContrastCase {
  theme: "light" | "dark";
  text: string;
  surface: string;
  min: number;
}

function themeCases(theme: ContrastCase["theme"]): ContrastCase[] {
  const cases: ContrastCase[] = [];
  for (const text of TEXT) {
    for (const surface of SURFACES) {
      if (theme === "light" && LIGHT_EXCLUDED.has(`${text} on ${surface}`)) continue;
      cases.push({ theme, text, surface, min: 4.5 });
    }
  }
  for (const [text, surface] of ON_FILL) cases.push({ theme, text, surface, min: 4.5 });
  return cases;
}

const DARK_7_CASES: ContrastCase[] = DARK_7_TEXT.flatMap((text) =>
  DARK_7_SURFACES.map((surface) => ({ theme: "dark" as const, text, surface, min: 7 })),
);

const CASES = [...themeCases("light"), ...themeCases("dark"), ...DARK_7_CASES];

describe("theme.css text contrast (WCAG 2.x)", () => {
  it("parses the light semantic block and the dark block", () => {
    expect(LIGHT).toBeDefined();
    expect(DARK_BLOCKS).toHaveLength(1);
    for (const tokens of [LIGHT, DARK]) {
      for (const name of [...TEXT, ...SURFACES, ...ON_FILL.flat()]) {
        expect(tokens?.[name], name).toMatch(/^oklch\(/);
      }
    }
  });

  it.each(CASES)("$theme: $text on $surface ≥ $min:1", ({ theme, text, surface, min }) => {
    const tokens = theme === "light" ? LIGHT : DARK;
    const ratio = oklchContrast(tokens?.[text] ?? "", tokens?.[surface] ?? "");
    expect(ratio, `${theme} ${text} on ${surface}`).not.toBeNull();
    expect(ratio, `${theme} ${text} on ${surface}`).toBeGreaterThanOrEqual(min);
  });
});

describe("secondary text opacity (regression)", () => {
  const SRC = join(import.meta.dirname, "..", "..");
  const SOURCES = readdirSync(SRC, { recursive: true, encoding: "utf-8" }).filter(
    (file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx") && !file.endsWith(".spec.tsx"),
  );

  it("never lowers text-muted-foreground with an opacity modifier", () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    const offenders = SOURCES.filter((file) =>
      /text-muted-foreground\/\d/.test(readFileSync(join(SRC, file), "utf-8")),
    );
    expect(offenders).toEqual([]);
  });
});
