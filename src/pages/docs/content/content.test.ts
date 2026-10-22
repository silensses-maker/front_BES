import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import polarizationEn from "@/shared/i18n/locales/polarization.en";
import polarizationEs from "@/shared/i18n/locales/polarization.es";
import { slugify } from "@/shared/lib/slugify";
import { isScreenshotName } from "../lib/screenshot";
import { DOC_LANGS, DOC_SECTION_IDS, type DocLang } from "../model/sections";
import { MDX_COMPONENTS } from "../ui/mdx-components";

// MDX_COMPONENTS → doc-embeds → ROLE_LIMITS: the user entity's store imports the Firebase client
vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

/**
 * The manual's text, checked as files: every section exists in both languages with the same
 * structure, quotes the interface with its real labels, and links only to sections, headings and
 * pages that exist. The rendering is checked in docs-page.test.tsx.
 */

const CONTENT_DIR = import.meta.dirname;

function source(lang: DocLang, id: string): string {
  return readFileSync(join(CONTENT_DIR, lang, `${id}.mdx`), "utf-8");
}

const SOURCES = DOC_LANGS.flatMap((lang) =>
  DOC_SECTION_IDS.map((id) => ({ lang, id, text: source(lang, id) })),
);

const all = (text: string, pattern: RegExp, group = 1) =>
  Array.from(text.matchAll(pattern), (match) => match[group] ?? "");

/** `## …` / `### …` headings, as [level, text]. */
const headings = (text: string) =>
  Array.from(text.matchAll(/^(#{2,3}) (.+)$/gm), (match) => [
    match[1]?.length ?? 0,
    (match[2] ?? "").replace(/<[^>]+>|\*\*/g, "").trim(),
  ]) as [number, string][];

/** The id the page gives a heading (mdx-components.tsx): its slug. */
const anchors = (text: string) => headings(text).map(([, title]) => slugify(title));

type Tree = { readonly [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") out.set(`${prefix}${key}`, value);
    else for (const [k, v] of flatten(value, `${prefix}${key}.`)) out.set(k, v);
  }
  return out;
}

/** Every UI string of a language: the app's locale and the lazily registered polarization one. */
const labels = (main: Tree, polarization: Tree) =>
  new Map([...flatten(main), ...flatten({ polarization })]);

const LABELS: Record<DocLang, Map<string, string>> = {
  en: labels(en as Tree, polarizationEn as Tree),
  es: labels(es as Tree, polarizationEs as Tree),
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A label as the interface can show it: placeholders stand for any value ("Round 12"). */
const LABEL_PATTERNS: Record<DocLang, RegExp[]> = {
  en: [...LABELS.en.values()].map(labelPattern),
  es: [...LABELS.es.values()].map(labelPattern),
};

function labelPattern(value: string): RegExp {
  const parts = value.replace(/<\/?\w+>/g, "").split(/{{\s*\w+\s*}}/);
  return new RegExp(`^${parts.map(escapeRegExp).join(".+?")}$`);
}

/** Paths of the app's routes (src/app/routes.tsx), without their parameters. */
const ROUTES = new Set(
  all(
    readFileSync(join(CONTENT_DIR, "..", "..", "..", "app", "routes.tsx"), "utf-8"),
    /path="([^"]+)"/g,
  ).filter((path) => !path.includes(":") && path !== "*"),
);

describe("user manual content", () => {
  it("has one MDX file per section and language, and no other", () => {
    for (const lang of DOC_LANGS) {
      const files = readdirSync(join(CONTENT_DIR, lang)).sort();
      expect(files).toEqual(DOC_SECTION_IDS.map((id) => `${id}.mdx`).sort());
    }
  });

  it.each(DOC_SECTION_IDS)("%s has the same structure in English and Spanish", (id) => {
    const enText = source("en", id);
    const esText = source("es", id);
    expect(headings(enText).map(([level]) => level)).toEqual(
      headings(esText).map(([level]) => level),
    );
    expect(all(enText, /<Screenshot name="([^"]+)"/g)).toEqual(
      all(esText, /<Screenshot name="([^"]+)"/g),
    );
    // Callouts, previews and embeds alike; quoted labels and keys may differ between languages
    const tags = (text: string) =>
      all(text, /<([A-Z][A-Za-z0-9]*)\b/g).filter((tag) => tag !== "Ui" && tag !== "Kbd");
    expect(tags(enText)).toEqual(tags(esText));
  });

  it.each(SOURCES)("$lang/$id starts with a section heading and its anchors are unique", ({
    text,
  }) => {
    expect(text.trimStart().startsWith("## ")).toBe(true);
    const ids = anchors(text);
    expect(ids.every((anchor) => anchor !== "")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SOURCES)("$lang/$id only uses the components the manual provides", ({ text }) => {
    const tags = new Set(all(text, /<([A-Z][A-Za-z0-9]*)\b/g));
    expect([...tags].filter((tag) => !(tag in MDX_COMPONENTS))).toEqual([]);
  });

  it.each(SOURCES)("$lang/$id quotes the interface with its real $lang labels", ({
    lang,
    text,
  }) => {
    const quoted = all(text, /<Ui>([\s\S]*?)<\/Ui>/g);
    expect(quoted.length).toBeGreaterThan(0);
    const unknown = quoted.filter((label) => !LABEL_PATTERNS[lang].some((p) => p.test(label)));
    expect(unknown).toEqual([]);
  });

  it.each(SOURCES)("$lang/$id shows real buttons by existing i18n keys", ({ text }) => {
    for (const key of all(text, /<UiButton k="([^"]+)"/g)) {
      expect(LABELS.en.has(key), key).toBe(true);
      expect(LABELS.es.has(key), key).toBe(true);
    }
  });

  it.each(SOURCES)("$lang/$id links to existing sections, headings and pages", ({ lang, text }) => {
    for (const href of all(text, /\]\((\/[^)\s]*)\)/g)) {
      const [path = "", hash] = href.split("#");
      const section = /^\/docs\/([a-z-]+)$/.exec(path)?.[1];
      if (section !== undefined) {
        expect(DOC_SECTION_IDS, href).toContain(section);
        if (hash !== undefined) expect(anchors(source(lang, section)), href).toContain(hash);
      } else {
        expect(ROUTES.has(path), href).toBe(true);
      }
    }
  });

  it("names every screenshot slot once in the manual, with a description", () => {
    const slots = SOURCES.filter(({ lang }) => lang === "en").flatMap(({ text }) =>
      all(text, /<Screenshot name="([^"]+)"/g),
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.filter((name) => !isScreenshotName(name))).toEqual([]);
    expect(new Set(slots).size).toBe(slots.length);

    for (const { text } of SOURCES) {
      for (const alt of all(text, /<Screenshot name="[^"]+" alt="([^"]*)"/g)) {
        expect(alt).toMatch(/^\S.{20,}\.$/);
      }
    }
  });
});
