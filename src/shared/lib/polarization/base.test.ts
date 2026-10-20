import { describe, expect, it } from "vitest";
import { NO_CLASSIFICATION, ParametricPolarizationMeasure, PolarizationMeasure } from "./base";
import { uiClassifier } from "./classification";
import { isPolarizationError, PolarizationError } from "./errors";
import { EstebanRay } from "./literature/esteban-ray";
import { BiPol } from "./proposed/bipol";
import { MEC } from "./proposed/mec";
import { MECNormalized } from "./proposed/mec-normalized";
import { categoryLabels } from "./thresholds";

const X = [0, 0.25, 0.5, 0.75, 1];
const W = [0.2, 0.2, 0.2, 0.2, 0.2];

/** Returns a fixed value — exercises the base class like the package's MockPolarizationMeasure. */
class Fixed extends PolarizationMeasure {
  protected readonly className = "Fixed";
  constructor(private readonly value: number) {
    super();
  }
  compute(): number {
    return this.value;
  }
}

class FixedParametric extends ParametricPolarizationMeasure {
  protected readonly className = "FixedParametric";
  compute(): number {
    return 0.5;
  }
}

describe("PolarizationMeasure", () => {
  it("uses the class name as measure id, overridable like the package's setter", () => {
    const measure = new Fixed(0.4);
    expect(measure.measureId).toBe("Fixed");
    expect(measure.findMatchingParameterSet()).toBeNull();
    measure.measureId = "BiPol";
    expect(measure.measureId).toBe("BiPol");
    expect(measure.hasParameterSets()).toBe(false);
    expect(measure.findMatchingParameterSet()).toBe("default");
    measure.measureId = "EstebanRay";
    expect(measure.hasParameterSets()).toBe(true);
    // No parameters at all: the alpha the set lists is missing
    expect(measure.findMatchingParameterSet()).toBeNull();
  });

  it("matches parameter sets only on the parameters they list (EstebanRay ignores K)", () => {
    expect(new EstebanRay(0.8, 5).findMatchingParameterSet()).toBe("default");
    expect(new EstebanRay(0.8 * (1 + 1e-12)).findMatchingParameterSet()).toBe("default");
    expect(new EstebanRay(0.81).findMatchingParameterSet()).toBeNull();
    expect(new MECNormalized(2, 1.15).findMatchingParameterSet()).toBe("default");
    expect(new MECNormalized(2, 1.2).findMatchingParameterSet()).toBeNull();
    expect(new MEC().findMatchingParameterSet()).toBeNull();
    expect(new BiPol().findMatchingParameterSet()).toBe("default");
  });

  it("compares non-numeric parameter values by equality", () => {
    const measure = new FixedParametric({ alpha: "0.8" });
    measure.measureId = "EstebanRay";
    expect(measure.findMatchingParameterSet()).toBeNull();
    const parametricBiPol = new FixedParametric({ any: 1 });
    parametricBiPol.measureId = "BiPol";
    expect(parametricBiPol.findMatchingParameterSet()).toBeNull();
  });

  it("call() validates, computes and caches the last result", () => {
    const measure = new Fixed(0.25);
    expect(measure.lastResult).toBeNull();
    expect(measure.call(X, W)).toBe(0.25);
    expect(measure.lastResult).toBe(0.25);
    expect(() => measure.call(X, [0, 0, 0, 0, 0])).toThrow(PolarizationError);
  });

  it("classifies with labels=n like the package", () => {
    const measure = new Fixed(0.45);
    measure.measureId = "EstebanRay";
    // Fixed has no alpha parameter → no matching set
    expect(measure.callWithLabels(X, W, 3)).toEqual([0.45, NO_CLASSIFICATION]);

    const er = new EstebanRay();
    const [value, label] = er.callWithLabels(X, W, 3);
    expect(label).toBe(er.classifyValue(value, 3));
    expect(er.callWithLabels(X, W, 5, "percentile")[1]).toBe(
      er.classifyValue(value, 5, "percentile"),
    );
    // No thresholds for 6 categories: ValueError → no_classification
    expect(er.callWithLabels(X, W, 6)).toEqual([value, NO_CLASSIFICATION]);
  });

  it("rejects invalid label counts", () => {
    const er = new EstebanRay();
    expect(() => er.callWithLabels(X, W, 1)).toThrow(
      "Invalid value for 'labels': 1. Must be None, a positive integer, or 'all'.",
    );
    expect(() => er.callWithLabels(X, W, 2.5)).toThrow(PolarizationError);
  });

  it("returns every classification with labels='all'", () => {
    const bipol = new BiPol();
    const all = bipol.callWithAllLabels(X, [0.5, 0, 0, 0, 0.5]);
    expect(all.value).toBe(1);
    expect(Object.keys(all.classifications)).toEqual(["kmeans", "percentile"]);
    expect(all.classifications.kmeans).toEqual({ 3: "high", 4: "very_high", 5: "very_high" });

    const none = new MEC().callWithAllLabels(X, W);
    expect(none.error).toBe("No matching thresholds found for the current parameters");
    expect(none.classifications).toEqual({});
  });

  it("reports missing thresholds with the package's messages", () => {
    const fixed = new Fixed(0.1);
    expect(() => fixed.getThresholds(3)).toThrow("No thresholds available for measure: Fixed");
    expect(fixed.getAllClassifications(0.1)).toEqual({ value: 0.1, classifications: {} });

    const er = new EstebanRay();
    expect(() => er.getThresholds(3, "kmeans", "other")).toThrow(
      "Parameter set 'other' not found for measure: EstebanRay",
    );
    expect(() => er.getThresholds(3, "median" as "kmeans")).toThrow(
      "Method 'median' not available for measure: EstebanRay",
    );
    expect(() => er.getThresholds(9)).toThrow(
      "No kmeans thresholds for 9 categories in measure: EstebanRay",
    );
    expect(er.getAllClassifications(0.4, "other")).toEqual({
      value: 0.4,
      classifications: {},
      error: "Parameter set 'other' not found",
    });
  });

  it("labels a value with the first threshold it is below, else the last label", () => {
    const er = new EstebanRay();
    expect(er.classifyValue(0.1, 3)).toBe("low");
    expect(er.classifyValue(0.3791, 3)).toBe("medium");
    expect(er.classifyValue(0.6, 3)).toBe("high");
    expect(er.classifyValue(Number.NaN, 3)).toBe("high");
    expect(categoryLabels(6)).toEqual([
      "category_1",
      "category_2",
      "category_3",
      "category_4",
      "category_5",
      "category_6",
    ]);
  });

  it("updateParameters merges parameters and clears the cached result", () => {
    const measure = new FixedParametric({ alpha: 1 });
    measure.call(X, W);
    expect(measure.lastResult).toBe(0.5);
    measure.updateParameters({ alpha: 2, beta: 3 });
    expect(measure.getParameters()).toEqual({ alpha: 2, beta: 3 });
    expect(measure.lastResult).toBeNull();
  });
});

describe("uiClassifier", () => {
  it("uses k-means with 3 levels and skips non-finite values", () => {
    const classifier = uiClassifier(new EstebanRay());
    expect(classifier?.paramSet).toBe("default");
    expect(classifier?.labels).toEqual(["low", "medium", "high"]);
    expect(classifier?.levelOf(0.2)).toBe("low");
    expect(classifier?.levelOf(0.45)).toBe("medium");
    expect(classifier?.levelOf(0.9)).toBe("high");
    expect(classifier?.levelOf(Number.NaN)).toBeNull();
    expect(uiClassifier(new MEC())).toBeNull();
  });

  it("returns null when the thresholds cannot be read", () => {
    class Broken extends EstebanRay {
      override getThresholds(): readonly number[] {
        throw new PolarizationError("ValueError", "broken");
      }
    }
    expect(uiClassifier(new Broken())).toBeNull();
  });
});

describe("errors", () => {
  it("records the Python exception type", () => {
    const err = new PolarizationError("ZeroDivisionError", "x");
    expect(err.name).toBe("PolarizationError");
    expect(err.pythonType).toBe("ZeroDivisionError");
    expect(isPolarizationError(err)).toBe(true);
    expect(isPolarizationError(new Error("x"))).toBe(false);
  });
});
