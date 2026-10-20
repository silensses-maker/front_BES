/**
 * Ported from ulvenforst/pol_measures @ 0e05564 (PROMUEVA), used with the authors' permission.
 * Source: src/measures/base.py — `PolarizationMeasure` / `ParametricPolarizationMeasure`.
 *
 * Python's `__call__(x, weights, labels=None, method="kmeans", normalize_weights=False,
 * normalize_positions=True)` is split by return type: `call` (labels=None), `callWithLabels`
 * (labels=int) and `callWithAllLabels` (labels="all"). Threshold lookup matches the measure id
 * (the Python class name) and, for parametrized thresholds, compares ONLY the parameters each
 * set lists (math.isclose, rel_tol 1e-9) — e.g. EstebanRay's K is not compared.
 */

import { isPolarizationError, valueError } from "./errors";
import { isClose } from "./np";
import {
  type ClassificationMethod,
  categoryLabels,
  isParametrized,
  THRESHOLDS,
  type ThresholdsByMethod,
} from "./thresholds";
import { type HistogramOptions, validateHistogram } from "./validation";

export type MeasureParameters = Readonly<Record<string, unknown>>;

export interface AllClassifications {
  value: number;
  /** method → number of categories → label. */
  classifications: Record<string, Record<number, string>>;
  error?: string;
}

/** Returned by `callWithLabels` when no thresholds apply (package string). */
export const NO_CLASSIFICATION = "no_classification";

const FLOAT_TOLERANCE = 1e-9;

export abstract class PolarizationMeasure {
  /** The Python class name: the default threshold-lookup id (minification-proof). */
  protected abstract readonly className: string;
  private customMeasureId: string | null = null;
  protected cachedResult: number | null = null;

  get measureId(): string {
    return this.customMeasureId ?? this.className;
  }

  set measureId(value: string) {
    this.customMeasureId = value;
  }

  /** The measure on an already validated histogram. */
  abstract compute(x: Float64Array, weights: Float64Array): number;

  /** Parameters used by the measure (empty for non-parametric measures). */
  getParameters(): Record<string, unknown> {
    return {};
  }

  hasParameterSets(): boolean {
    const entry = THRESHOLDS[this.measureId];
    return entry !== undefined && isParametrized(entry);
  }

  /** The THRESHOLDS parameter set matching the current parameters, or null. */
  findMatchingParameterSet(): string | null {
    const entry = THRESHOLDS[this.measureId];
    if (entry === undefined) return null;
    const current = this.getParameters();
    if (!isParametrized(entry)) return Object.keys(current).length === 0 ? "default" : null;

    for (const [setKey, setParams] of Object.entries(entry.params)) {
      let allMatch = true;
      for (const [param, expected] of Object.entries(setParams)) {
        if (!(param in current)) {
          allMatch = false;
          break;
        }
        const actual = current[param];
        if (typeof expected === "number" && typeof actual === "number") {
          if (!isClose(expected, actual, FLOAT_TOLERANCE)) {
            allMatch = false;
            break;
          }
        } else if (expected !== actual) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return setKey;
    }
    return null;
  }

  /** `measure(x, weights)`: validates (and optionally normalizes), then computes. */
  call(x: ArrayLike<number>, weights: ArrayLike<number>, options?: HistogramOptions): number {
    const valid = validateHistogram(x, weights, options);
    this.cachedResult = this.compute(valid.x, valid.weights);
    return this.cachedResult;
  }

  /** `measure(x, weights, labels=n, method=…)`: the value and its category. */
  callWithLabels(
    x: ArrayLike<number>,
    weights: ArrayLike<number>,
    labels: number,
    method: ClassificationMethod = "kmeans",
    options?: HistogramOptions,
  ): [number, string] {
    const value = this.call(x, weights, options);
    if (!Number.isInteger(labels) || labels < 2) {
      throw valueError(
        `Invalid value for 'labels': ${labels}. Must be None, a positive integer, or 'all'.`,
      );
    }
    const paramSet = this.findMatchingParameterSet();
    if (paramSet === null) return [value, NO_CLASSIFICATION];
    try {
      return [value, this.classifyValue(value, labels, method, paramSet)];
    } catch (err) {
      if (isPolarizationError(err) && err.pythonType === "ValueError") {
        return [value, NO_CLASSIFICATION];
      }
      throw err;
    }
  }

  /** `measure(x, weights, labels="all")`: every available classification. */
  callWithAllLabels(
    x: ArrayLike<number>,
    weights: ArrayLike<number>,
    options?: HistogramOptions,
  ): AllClassifications {
    const value = this.call(x, weights, options);
    const paramSet = this.findMatchingParameterSet();
    if (paramSet === null) {
      return {
        value,
        classifications: {},
        error: "No matching thresholds found for the current parameters",
      };
    }
    return this.getAllClassifications(value, paramSet);
  }

  private methodsFor(paramSet: string): ThresholdsByMethod | null {
    const entry = THRESHOLDS[this.measureId];
    if (entry === undefined) return null;
    if (!isParametrized(entry)) return entry;
    return entry.sets[paramSet] ?? null;
  }

  getThresholds(
    numCategories: number,
    method: ClassificationMethod = "kmeans",
    paramSet = "default",
  ): readonly number[] {
    if (THRESHOLDS[this.measureId] === undefined) {
      throw valueError(`No thresholds available for measure: ${this.measureId}`);
    }
    const methods = this.methodsFor(paramSet);
    if (methods === null) {
      throw valueError(`Parameter set '${paramSet}' not found for measure: ${this.measureId}`);
    }
    const byCategories = methods[method];
    if (byCategories === undefined) {
      throw valueError(`Method '${method}' not available for measure: ${this.measureId}`);
    }
    const thresholds = byCategories[numCategories];
    if (thresholds === undefined) {
      throw valueError(
        `No ${method} thresholds for ${numCategories} categories in measure: ${this.measureId}`,
      );
    }
    return thresholds;
  }

  classifyValue(
    value: number,
    numCategories: number,
    method: ClassificationMethod = "kmeans",
    paramSet = "default",
  ): string {
    const thresholds = this.getThresholds(numCategories, method, paramSet);
    const labels = categoryLabels(numCategories);
    for (let i = 0; i < thresholds.length; i++) {
      if (value < (thresholds[i] as number)) return labels[i] as string;
    }
    return labels[labels.length - 1] as string;
  }

  getAllClassifications(value: number, paramSet = "default"): AllClassifications {
    const result: AllClassifications = { value, classifications: {} };
    if (THRESHOLDS[this.measureId] === undefined) return result;
    const methods = this.methodsFor(paramSet);
    if (methods === null) {
      return { value, classifications: {}, error: `Parameter set '${paramSet}' not found` };
    }
    for (const [method, byCategories] of Object.entries(methods)) {
      const perCount: Record<number, string> = {};
      result.classifications[method] = perCount;
      for (const count of Object.keys(byCategories ?? {})) {
        const numCategories = Number(count);
        perCount[numCategories] = this.classifyValue(
          value,
          numCategories,
          method as ClassificationMethod,
          paramSet,
        );
      }
    }
    return result;
  }

  get lastResult(): number | null {
    return this.cachedResult;
  }
}

export abstract class ParametricPolarizationMeasure extends PolarizationMeasure {
  parameters: Record<string, unknown>;

  constructor(parameters: Record<string, unknown>) {
    super();
    this.parameters = { ...parameters };
  }

  /** Merges new parameter values (Python `update_parameters`). */
  updateParameters(parameters: Record<string, unknown>): void {
    Object.assign(this.parameters, parameters);
    this.cachedResult = null;
  }

  override getParameters(): Record<string, unknown> {
    return { ...this.parameters };
  }
}
