import { describe, expect, it } from "vitest";
import { ALIENATION_IDS, ALIENATIONS, isAlienationId } from "./alienation";
import { createMeasure } from "./factory";
import {
  DEFAULT_MEASURE,
  defaultParams,
  isInRange,
  isMeasureId,
  LITERATURE_MEASURES,
  MEASURE_IDS,
  MEASURES,
  PROPOSED_MEASURES,
  paramsKey,
  REFERENCES,
  supportsCategories,
} from "./registry";

describe("measure registry", () => {
  it("lists the 10 measures pol_measures exports, split into literature and proposed", () => {
    expect(MEASURE_IDS).toHaveLength(10);
    expect([...LITERATURE_MEASURES, ...PROPOSED_MEASURES].sort()).toEqual([...MEASURE_IDS].sort());
    for (const id of LITERATURE_MEASURES) expect(MEASURES[id].kind).toBe("literature");
    for (const id of PROPOSED_MEASURES) expect(MEASURES[id].kind).toBe("proposed");
    expect(DEFAULT_MEASURE).toBe("EstebanRay");
  });

  it("flags MECNormalized as beta and credits BiPol to Carlos Pinzón", () => {
    expect(MEASURE_IDS.filter((id) => MEASURES[id].beta)).toEqual(["MECNormalized"]);
    expect(MEASURES.BiPol.credit).toBe("Carlos Pinzón");
  });

  it("has thresholds exactly for EstebanRay, BiPol and MECNormalized", () => {
    expect(MEASURE_IDS.filter((id) => MEASURES[id].hasThresholds).sort()).toEqual([
      "BiPol",
      "EstebanRay",
      "MECNormalized",
    ]);
  });

  it("uses the package defaults", () => {
    expect(defaultParams("EstebanRay")).toEqual({ alpha: 0.8, K: null });
    expect(defaultParams("GeneralizedER")).toEqual({ alpha: 0.8, alienation: "d" });
    expect(defaultParams("MEC")).toEqual({ alpha: 2, beta: 1.15 });
    expect(defaultParams("MECNormalized")).toEqual({ alpha: 2, beta: 1.15 });
    expect(defaultParams("GeneralizedMEC")).toEqual({ alpha: 2, alienation: "d" });
    expect(defaultParams("BiPol")).toEqual({});
  });

  it("knows which category counts each measure supports", () => {
    expect(supportsCategories("Experts", 5)).toBe(true);
    expect(supportsCategories("Experts", 7)).toBe(false);
    expect(supportsCategories("VanDerEijkPol", 3)).toBe(true);
    expect(supportsCategories("VanDerEijkPol", 2)).toBe(false);
    expect(supportsCategories("MEC", 2)).toBe(true);
  });

  it("checks parameter ranges", () => {
    const [erAlpha, erK] = MEASURES.EstebanRay.params;
    if (erAlpha?.kind !== "number" || erK?.kind !== "optional-number") throw new Error("specs");
    expect(isInRange(erAlpha, 1.6)).toBe(true);
    expect(isInRange(erAlpha, 1.7)).toBe(false);
    expect(isInRange(erAlpha, 0)).toBe(false);
    expect(isInRange(erAlpha, Number.NaN)).toBe(false);
    expect(isInRange(erK, 100)).toBe(true);
    const [mecAlpha] = MEASURES.MEC.params;
    if (mecAlpha?.kind !== "number") throw new Error("spec");
    expect(isInRange(mecAlpha, 50)).toBe(true);
  });

  it("builds stable memo keys", () => {
    expect(paramsKey("MEC", { alpha: 2, beta: 1.15 })).toBe("MEC|alpha=2|beta=1.15");
    expect(paramsKey("GeneralizedMEC", { alpha: 1, alienation: "d^2" })).toBe(
      "GeneralizedMEC|alpha=1|alienation=d^2",
    );
    expect(paramsKey("BiPol", {})).toBe("BiPol");
  });

  it("guards ids", () => {
    expect(isMeasureId("MEC")).toBe(true);
    expect(isMeasureId("Mec")).toBe(false);
    expect(isAlienationId("exp(2d)-1")).toBe(true);
    expect(isAlienationId("d^4")).toBe(false);
    expect(isAlienationId(3)).toBe(false);
  });

  it("references the README's literature [1]–[5] and the MEC paper", () => {
    const readme = Object.values(REFERENCES)
      .map((ref) => ref.readme)
      .filter((n) => n !== null)
      .sort();
    expect(readme).toEqual([1, 2, 3, 4, 5]);
    expect(REFERENCES.aranda2026.url).toContain("2606.13997");
  });
});

describe("createMeasure", () => {
  it("builds every measure with its defaults under the package's class name", () => {
    for (const id of MEASURE_IDS) {
      const measure = createMeasure(id);
      expect(measure.measureId).toBe(id);
      const value = measure.call([0, 0.25, 0.5, 0.75, 1], [0.4, 0.1, 0, 0.1, 0.4]);
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("passes parameters through, alienation included", () => {
    expect(createMeasure("EstebanRay", { alpha: 1, K: 1 }).getParameters()).toEqual({
      alpha: 1,
      K: 1,
    });
    const gmec = createMeasure("GeneralizedMEC", { alienation: "d^2" });
    const mec = createMeasure("MEC", { alpha: 2, beta: 2 });
    const x = [0, 0.5, 1];
    const w = [0.2, 0.3, 0.5];
    expect(gmec.call(x, w)).toBeCloseTo(mec.call(x, w), 8);
    expect(createMeasure("GeneralizedER", { alienation: "exp(d)-1" }).getParameters()).toEqual({
      alpha: 0.8,
    });
  });

  it("exposes the alienation functions the package's validation uses", () => {
    expect(ALIENATION_IDS).toHaveLength(7);
    expect(ALIENATIONS["d+2d^2"](0.5)).toBe(1);
    expect(ALIENATIONS["exp(d)-1"](0)).toBe(0);
    expect(ALIENATIONS["d^3"](0.5)).toBe(0.125);
  });
});
