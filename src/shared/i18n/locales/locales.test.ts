import { describe, expect, it } from "vitest";
import en from "./en";
import es from "./es";

type Tree = { readonly [key: string]: string | Tree };

/** Flattens a locale into `[dotted.key, value]` pairs. */
function flatten(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`),
  );
}

const enEntries = flatten(en);
const esEntries = flatten(es);

describe("locales", () => {
  it("en and es define exactly the same keys", () => {
    expect(esEntries.map(([key]) => key).sort()).toEqual(enEntries.map(([key]) => key).sort());
  });

  it.each([
    ["en", enEntries],
    ["es", esEntries],
  ] as const)("%s has no empty strings", (_lng, entries) => {
    expect(entries.filter(([, value]) => value.trim() === "").map(([key]) => key)).toEqual([]);
  });

  it.each([
    ["en", enEntries],
    ["es", esEntries],
  ] as const)("%s has no developer placeholders (issue refs, lorem ipsum)", (_lng, entries) => {
    const placeholders = entries.filter(([, value]) => /issue #\d+|lorem ipsum/i.test(value));
    expect(placeholders.map(([key]) => key)).toEqual([]);
  });

  it.each([
    ["en", enEntries],
    ["es", esEntries],
  ] as const)("%s does not expose the code repository (GitHub)", (_lng, entries) => {
    const mentions = entries.filter(([, value]) => /github/i.test(value));
    expect(mentions.map(([key]) => key)).toEqual([]);
  });

  it("en and es use the same interpolation placeholders and markup tags per key", () => {
    const tokens = (value: string) => (value.match(/{{\w+}}|<\/?\w+>/g) ?? []).sort();
    const esByKey = new Map(esEntries);
    const mismatches = enEntries
      .filter(([key, value]) => {
        const esValue = esByKey.get(key);
        return esValue !== undefined && tokens(esValue).join() !== tokens(value).join();
      })
      .map(([key]) => key);
    expect(mismatches).toEqual([]);
  });
});
