/**
 * Polarization replica (#129) — metadata of the 10 measures pol_measures @ 0e05564 exports
 * (ulvenforst/pol_measures, PROMUEVA). Metadata only (no measure code), so the wiki can read it
 * without pulling the implementations; `createMeasure` (./factory.ts) builds instances.
 *
 * Defaults and ranges are the package's: constructor defaults, constructor checks (EstebanRay
 * α ∈ (0, 1.6]; GeneralizedER / GeneralizedMEC α > 0) and compute-time `validate_parameters`
 * (MEC family: α, β > 0). Categories: Experts only accepts 5; VanDerEijkPol is undefined (NaN)
 * below 3; everything needs at least 2 (histogram validation).
 */

import { ALIENATION_IDS, type AlienationId } from "./alienation";

export const MEASURE_IDS = [
  "EstebanRay",
  "GeneralizedER",
  "EMDPol",
  "Experts",
  "ShannonPol",
  "VanDerEijkPol",
  "MEC",
  "MECNormalized",
  "GeneralizedMEC",
  "BiPol",
] as const;

export type MeasureId = (typeof MEASURE_IDS)[number];
export type MeasureKind = "literature" | "proposed";

export type ReferenceId =
  | "lupu2017"
  | "koudenburg2021"
  | "kawada2018"
  | "esteban1994"
  | "tastle2007"
  | "vanDerEijk2001"
  | "aranda2026";

export interface Reference {
  /** README number [1]–[5] for the literature measures (null for the MEC paper). */
  readme: number | null;
  citation: string;
  url: string;
}

export const REFERENCES: Readonly<Record<ReferenceId, Reference>> = {
  lupu2017: {
    readme: 1,
    citation:
      "N. Lupu, L. Selios, Z. Warner. A New Measure of Congruence: The Earth Mover's Distance. Political Analysis 25(1), 2017.",
    url: "https://www.cambridge.org/core/journals/political-analysis/article/abs/new-measure-of-congruence-the-earth-movers-distance/8699CA3E41430C3E3B9086D0709B388A",
  },
  koudenburg2021: {
    readme: 2,
    citation:
      "N. Koudenburg, H. A. L. Kiers, Y. Kashima. A New Opinion Polarization Index Developed by Integrating Expert Judgments. Frontiers in Psychology 12, 2021.",
    url: "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.738258/full",
  },
  kawada2018: {
    readme: 3,
    citation:
      "Y. Kawada, Y. Nakamura, K. Sunada. A Characterization of the Esteban–Ray Polarization Measures. Economics Letters 169, 2018.",
    url: "https://doi.org/10.1016/j.econlet.2018.05.011",
  },
  esteban1994: {
    readme: null,
    citation:
      "J.-M. Esteban, D. Ray. On the Measurement of Polarization. Econometrica 62(4), 1994.",
    url: "https://doi.org/10.2307/2951734",
  },
  tastle2007: {
    readme: 4,
    citation:
      "W. J. Tastle, M. J. Wierman. Consensus and dissention: A measure of ordinal dispersion. International Journal of Approximate Reasoning 45(3), 2007.",
    url: "https://doi.org/10.1016/j.ijar.2006.06.024",
  },
  vanDerEijk2001: {
    readme: 5,
    citation:
      "C. van der Eijk. Measuring Agreement in Ordered Rating Scales. Quality and Quantity 35(3), 2001.",
    url: "https://doi.org/10.1023/A:1010374114305",
  },
  aranda2026: {
    readme: null,
    citation:
      "J. Aranda, J. F. Díaz, J. C. Narváez, C. Palamidessi, C. Pinzón, F. Valencia, O. Vargas. Minimal Effort to Consensus (MEC) polarization measure. arXiv:2606.13997, 2026.",
    url: "https://arxiv.org/abs/2606.13997",
  },
};

export interface NumberParamSpec {
  kind: "number";
  key: "alpha" | "beta";
  tex: string;
  defaultValue: number;
  /** Exclusive lower bound. */
  minExclusive: number;
  /** Inclusive upper bound (null = unbounded). */
  max: number | null;
  step: number;
}

/** EstebanRay's K: null = the package's default normalization. */
export interface OptionalNumberParamSpec {
  kind: "optional-number";
  key: "K";
  tex: string;
  defaultValue: null;
  minExclusive: number;
  step: number;
}

export interface ChoiceParamSpec {
  kind: "choice";
  key: "alienation";
  tex: string;
  defaultValue: AlienationId;
  options: readonly AlienationId[];
}

export type ParamSpec = NumberParamSpec | OptionalNumberParamSpec | ChoiceParamSpec;
export type ParamKey = ParamSpec["key"];

export interface MeasureParams {
  alpha?: number;
  beta?: number;
  K?: number | null;
  alienation?: AlienationId;
}

export interface MeasureMeta {
  id: MeasureId;
  /** Display name (proper name, untranslated). */
  name: string;
  kind: MeasureKind;
  params: readonly ParamSpec[];
  /** Smallest number of categories the measure is defined for. */
  minCategories: number;
  /** When set, the ONLY number of categories accepted. */
  exactCategories: number | null;
  references: readonly ReferenceId[];
  /** Still being developed upstream (README): labelled BETA. */
  beta: boolean;
  /** Implementation credit given by the package README. */
  credit: string | null;
  /** THRESHOLDS has an entry (classification possible for matching parameters). */
  hasThresholds: boolean;
}

// Parameter specs. Plain literals (no calls or spreads at module level) keep the module free of
// side effects, so a build with the replica disabled drops it entirely.
const ALPHA_ER: NumberParamSpec = {
  kind: "number",
  key: "alpha",
  tex: "\\alpha",
  defaultValue: 0.8,
  minExclusive: 0,
  max: 1.6,
  step: 0.05,
};
const ALPHA_GER: NumberParamSpec = {
  kind: "number",
  key: "alpha",
  tex: "\\alpha",
  defaultValue: 0.8,
  minExclusive: 0,
  max: null,
  step: 0.05,
};
const ALPHA_MEC: NumberParamSpec = {
  kind: "number",
  key: "alpha",
  tex: "\\alpha",
  defaultValue: 2,
  minExclusive: 0,
  max: null,
  step: 0.05,
};
const BETA_MEC: NumberParamSpec = {
  kind: "number",
  key: "beta",
  tex: "\\beta",
  defaultValue: 1.15,
  minExclusive: 0,
  max: null,
  step: 0.05,
};
const ALIENATION: ChoiceParamSpec = {
  kind: "choice",
  key: "alienation",
  tex: "f",
  defaultValue: "d",
  options: ALIENATION_IDS,
};
const K_ER: OptionalNumberParamSpec = {
  kind: "optional-number",
  key: "K",
  tex: "K",
  defaultValue: null,
  minExclusive: 0,
  step: 0.1,
};

export const MEASURES: Readonly<Record<MeasureId, MeasureMeta>> = {
  EstebanRay: {
    id: "EstebanRay",
    name: "Esteban–Ray",
    kind: "literature",
    params: [ALPHA_ER, K_ER],
    minCategories: 2,
    exactCategories: null,
    references: ["kawada2018", "esteban1994"],
    beta: false,
    credit: null,
    hasThresholds: true,
  },
  GeneralizedER: {
    id: "GeneralizedER",
    name: "Generalized ER",
    kind: "literature",
    params: [ALPHA_GER, ALIENATION],
    minCategories: 2,
    exactCategories: null,
    references: ["esteban1994"],
    beta: false,
    credit: null,
    hasThresholds: false,
  },
  EMDPol: {
    id: "EMDPol",
    name: "EMD-pol",
    kind: "literature",
    params: [],
    minCategories: 2,
    exactCategories: null,
    references: ["lupu2017"],
    beta: false,
    credit: null,
    hasThresholds: false,
  },
  Experts: {
    id: "Experts",
    name: "Experts",
    kind: "literature",
    params: [],
    minCategories: 5,
    exactCategories: 5,
    references: ["koudenburg2021"],
    beta: false,
    credit: null,
    hasThresholds: false,
  },
  ShannonPol: {
    id: "ShannonPol",
    name: "Shannon-pol",
    kind: "literature",
    params: [],
    minCategories: 2,
    exactCategories: null,
    references: ["tastle2007"],
    beta: false,
    credit: null,
    hasThresholds: false,
  },
  VanDerEijkPol: {
    id: "VanDerEijkPol",
    name: "Van der Eijk-pol",
    kind: "literature",
    params: [],
    minCategories: 3,
    exactCategories: null,
    references: ["vanDerEijk2001"],
    beta: false,
    credit: null,
    hasThresholds: false,
  },
  MEC: {
    id: "MEC",
    name: "MEC",
    kind: "proposed",
    params: [ALPHA_MEC, BETA_MEC],
    minCategories: 2,
    exactCategories: null,
    references: ["aranda2026"],
    beta: false,
    credit: null,
    hasThresholds: false,
  },
  MECNormalized: {
    id: "MECNormalized",
    name: "MEC normalized",
    kind: "proposed",
    params: [ALPHA_MEC, BETA_MEC],
    minCategories: 2,
    exactCategories: null,
    references: ["aranda2026"],
    beta: true,
    credit: null,
    hasThresholds: true,
  },
  GeneralizedMEC: {
    id: "GeneralizedMEC",
    name: "Generalized MEC",
    kind: "proposed",
    params: [ALPHA_MEC, ALIENATION],
    minCategories: 2,
    exactCategories: null,
    references: ["aranda2026"],
    beta: false,
    credit: null,
    hasThresholds: false,
  },
  BiPol: {
    id: "BiPol",
    name: "BiPol",
    kind: "proposed",
    params: [],
    minCategories: 2,
    exactCategories: null,
    references: [],
    beta: false,
    credit: "Carlos Pinzón",
    hasThresholds: true,
  },
};

export const LITERATURE_MEASURES: readonly MeasureId[] = [
  "EstebanRay",
  "GeneralizedER",
  "EMDPol",
  "Experts",
  "ShannonPol",
  "VanDerEijkPol",
];
export const PROPOSED_MEASURES: readonly MeasureId[] = [
  "MEC",
  "MECNormalized",
  "GeneralizedMEC",
  "BiPol",
];

export const DEFAULT_MEASURE: MeasureId = "EstebanRay";

export function isMeasureId(value: unknown): value is MeasureId {
  return typeof value === "string" && (MEASURE_IDS as readonly string[]).includes(value);
}

/** Whether the measure is defined for k categories. */
export function supportsCategories(id: MeasureId, k: number): boolean {
  const meta = MEASURES[id];
  if (meta.exactCategories !== null) return k === meta.exactCategories;
  return k >= meta.minCategories;
}

/** The package defaults for every parameter of the measure. */
export function defaultParams(id: MeasureId): MeasureParams {
  const params: MeasureParams = {};
  for (const spec of MEASURES[id].params) {
    if (spec.kind === "choice") params.alienation = spec.defaultValue;
    else if (spec.kind === "optional-number") params.K = spec.defaultValue;
    else params[spec.key] = spec.defaultValue;
  }
  return params;
}

/** Whether a number is inside a parameter's range. */
export function isInRange(spec: NumberParamSpec | OptionalNumberParamSpec, value: number): boolean {
  if (!Number.isFinite(value) || value <= spec.minExclusive) return false;
  return spec.kind === "optional-number" || spec.max === null || value <= spec.max;
}

/** Stable key of (measure, params) — the memo key's first half. */
export function paramsKey(id: MeasureId, params: MeasureParams): string {
  return [
    id,
    ...MEASURES[id].params.map((spec) => `${spec.key}=${String(params[spec.key] ?? "auto")}`),
  ].join("|");
}
