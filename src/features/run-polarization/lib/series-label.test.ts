import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PolarizationCatalog } from "@/shared/api/backend";
import { type SeriesLabelText, seriesLabel, seriesLabelParts, uniqueLabels } from "./series-label";

/** The catalog the real worker answered (pol_measures @ 0e05564), as the backend serves it. */
const catalog: PolarizationCatalog = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "__fixtures__", "pol-measures-catalog.json"),
    "utf8",
  ),
);

function measure(id: string) {
  const found = catalog.measures.find((m) => m.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

const en: SeriesLabelText = {
  lang: "en",
  belief: (belief) => belief,
  auto: "auto",
  alienations: catalog.alienations,
};
const es: SeriesLabelText = {
  ...en,
  lang: "es",
  belief: (belief) => (belief === "private" ? "privada" : "pública"),
};

describe("seriesLabel", () => {
  it("names the measure, k and belief; default parameters are left out", () => {
    expect(
      seriesLabel(
        {
          measure: measure("EstebanRay"),
          params: { alpha: 0.8, K: null },
          k: 5,
          belief: "private",
        },
        en,
      ),
    ).toBe("Esteban–Ray · k=5 · private");
    expect(seriesLabel({ measure: measure("BiPol"), params: {}, k: 3, belief: "public" }, es)).toBe(
      "BiPol · k=3 · pública",
    );
  });

  it("adds the parameters that differ from the package's defaults, in the UI language", () => {
    expect(
      seriesLabel(
        { measure: measure("MEC"), params: { alpha: 1.5, beta: 1.15 }, k: 7, belief: "private" },
        es,
      ),
    ).toBe("MEC · k=7 · privada · α=1,5");
    expect(
      seriesLabel(
        { measure: measure("EstebanRay"), params: { alpha: 0.8, K: 2 }, k: 5, belief: "private" },
        en,
      ),
    ).toBe("Esteban–Ray · k=5 · private · K=2");
  });

  it("shows f(d) by its catalog label, and an automatic value as such", () => {
    expect(
      seriesLabel(
        {
          measure: measure("GeneralizedMEC"),
          params: { alpha: 2, alienation: "d^2" },
          k: 5,
          belief: "private",
        },
        en,
      ),
    ).toBe("Generalized MEC · k=5 · private · f(d)=d²");
    // K is automatic (null) by default; a measure whose K defaulted to 2 would show "auto"
    const er = measure("EstebanRay");
    const withDefault = {
      ...er,
      params: er.params.map((p) =>
        p.type === "number" && p.name === "K" ? { ...p, default: 2 } : p,
      ),
    };
    expect(
      seriesLabel(
        { measure: withDefault, params: { alpha: 0.8, K: null }, k: 5, belief: "public" },
        en,
      ),
    ).toBe("Esteban–Ray · k=5 · public · K=auto");
  });
});

describe("uniqueLabels", () => {
  it("numbers repeated labels in order (an unchanged copy)", () => {
    expect(uniqueLabels(["A", "B", "A", "A"])).toEqual(["A", "B", "A (2)", "A (3)"]);
    expect(uniqueLabels([])).toEqual([]);
  });

  it("stays unique when a suffix would collide with another label, up to 10 series", () => {
    expect(uniqueLabels(["A", "A", "A (2)"])).toEqual(["A", "A (3)", "A (2)"]);
    expect(uniqueLabels(["A (2)", "A", "A"])).toEqual(["A (2)", "A", "A (3)"]);
    const ten = uniqueLabels([...Array(9).fill("MEC (k=5, private)"), "MEC (k=5, private) (2)"]);
    expect(new Set(ten).size).toBe(10);
    expect(ten[9]).toBe("MEC (k=5, private) (2)");
  });
});

describe("seriesLabelParts", () => {
  it("splits a label into the measure, k, belief and edited parameters", () => {
    expect(
      seriesLabelParts(
        { measure: measure("MEC"), params: { alpha: 1.5, beta: 1.15 }, k: 7, belief: "private" },
        es,
      ),
    ).toEqual({ measure: "MEC", k: "k=7", belief: "privada", params: ["α=1,5"] });
  });
});
