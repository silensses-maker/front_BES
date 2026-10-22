import { describe, expect, it } from "vitest";
import {
  adjacentDocSections,
  DOC_LANGS,
  DOC_SECTION_IDS,
  DOC_SECTIONS,
  docLang,
  docPath,
  findDocSection,
} from "./sections";

describe("docs sections registry", () => {
  it("lists every section once, in reading order 1 … n", () => {
    // polarization (#129) is compiled in under test (vitest.config.ts), so all sections are listed
    expect(DOC_SECTIONS.map((section) => section.id)).toEqual([...DOC_SECTION_IDS]);
    expect(DOC_SECTIONS.map((section) => section.order)).toEqual(
      DOC_SECTIONS.map((_, index) => index + 1),
    );
  });

  it("gives every section a title and a one-sentence summary in each language", () => {
    for (const section of DOC_SECTIONS) {
      for (const lang of DOC_LANGS) {
        expect(section.title[lang].trim()).not.toBe("");
        expect(section.summary[lang]).toMatch(/^\S.*\.$/);
      }
      expect(section.title.en).not.toBe(section.title.es);
    }
  });

  it("finds a section by its URL id, and nothing for the index or an unknown id", () => {
    expect(findDocSection("run-view")?.id).toBe("run-view");
    expect(findDocSection(undefined)).toBeNull();
    expect(findDocSection("nope")).toBeNull();
    expect(findDocSection("")).toBeNull();
  });

  it("links the index to the first section and each section to its neighbours", () => {
    const first = DOC_SECTIONS[0];
    const second = DOC_SECTIONS[1];
    const last = DOC_SECTIONS[DOC_SECTIONS.length - 1];
    expect(adjacentDocSections(null)).toEqual({ previous: null, next: first });
    expect(adjacentDocSections("getting-started")).toEqual({ previous: null, next: second });
    expect(adjacentDocSections("new-simulation")).toEqual({
      previous: first,
      next: DOC_SECTIONS[2],
    });
    expect(adjacentDocSections(last?.id ?? "profile")).toEqual({
      previous: DOC_SECTIONS[DOC_SECTIONS.length - 2],
      next: null,
    });
  });

  it("returns no neighbours for a section the build left out", () => {
    // A registry id that is not in DOC_SECTIONS (e.g. polarization in a flag-off build)
    expect(adjacentDocSections("nope" as never)).toEqual({ previous: null, next: null });
  });

  it.each([
    ["es", "es"],
    ["es-CO", "es"],
    ["ES", "es"],
    ["en", "en"],
    ["en-US", "en"],
    ["fr", "en"],
    [undefined, "en"],
  ] as const)("reads %s as the manual's %s", (language, expected) => {
    expect(docLang(language)).toBe(expected);
  });

  it("builds the index and section URLs", () => {
    expect(docPath(null)).toBe("/docs");
    expect(docPath("charts-and-data")).toBe("/docs/charts-and-data");
  });
});
