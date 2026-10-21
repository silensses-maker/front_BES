/**
 * Polarization (#129) — documentation of the pol_measures measures for the wiki (a public page:
 * it cannot read the server's authenticated catalog). Documentation only: the values come from
 * the package itself, on the server, and the run charts take the measures, defaults, ranges and
 * thresholds from the catalog (`GET /simulations/polarization/measures`).
 *
 * Describes pol_measures @ POL_MEASURES_SOURCE.commit (ulvenforst/pol_measures, PROMUEVA): its
 * constructors' defaults and checks, its `measures.thresholds` (kmeans, 3 levels) and the formulas
 * its code computes. Review it when the backend's POL_MEASURES_REF is bumped (README).
 */

export type ReferenceId =
  | "lupu2017"
  | "koudenburg2021"
  | "kawada2018"
  | "esteban1994"
  | "tastle2007"
  | "vanDerEijk2001"
  | "aranda2026";

export interface Reference {
  /** README number [1]–[5] for the literature measures (null for the others). */
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

export type MeasureDocId =
  | "EstebanRay"
  | "GeneralizedER"
  | "EMDPol"
  | "Experts"
  | "ShannonPol"
  | "VanDerEijkPol"
  | "MEC"
  | "MECNormalized"
  | "GeneralizedMEC"
  | "BiPol";

/** A documented parameter: TeX (default and range), or the automatic normalization K. */
export type ParamDoc = { tex: string } | { kAuto: true };

export interface MeasureDoc {
  id: MeasureDocId;
  /** Display name (proper name, untranslated). */
  name: string;
  /** TeX of what the package computes. */
  formula: string;
  params: readonly ParamDoc[];
  references: readonly ReferenceId[];
  /** Still being developed upstream (package README): labelled BETA. */
  beta: boolean;
  /** Implementation credit given by the package README. */
  credit: string | null;
  /** Only defined for k = 5 categories. */
  onlyFive: boolean;
}

const ALIENATIONS_TEX =
  "f(d) = d\\quad (d,\\ d^{2},\\ d^{3},\\ d + d^{2},\\ d + 2d^{2},\\ e^{d} - 1,\\ e^{2d} - 1)";
const K_AUTO: ParamDoc = { kAuto: true };

const ALPHA_MEC: ParamDoc = { tex: "\\alpha = 2\\quad (\\alpha > 0)" };
const BETA_MEC: ParamDoc = { tex: "\\beta = 1.15\\quad (\\beta > 0)" };

// Plain literals (no calls at module level): the module stays free of side effects, so a build
// with polarization disabled drops it.
export const LITERATURE_DOCS: readonly MeasureDoc[] = [
  {
    id: "EstebanRay",
    name: "Esteban–Ray",
    formula:
      "\\mathrm{ER}_{\\alpha}(\\pi) = K \\sum_{i=1}^{k}\\sum_{j=1}^{k} \\pi_i^{1+\\alpha}\\,\\pi_j\\,|x_i - x_j|, \\qquad K = \\frac{1}{2\\cdot 0.5^{2+\\alpha}}",
    params: [{ tex: "\\alpha = 0.8\\quad (\\alpha \\in (0, 1.6])" }, K_AUTO],
    references: ["kawada2018", "esteban1994"],
    beta: false,
    credit: null,
    onlyFive: false,
  },
  {
    id: "GeneralizedER",
    name: "Generalized ER",
    formula:
      "\\mathrm{ER}_{\\alpha,f}(\\pi) = K \\sum_{i}\\sum_{j} \\pi_i^{1+\\alpha}\\,\\pi_j\\,f(|x_i - x_j|), \\qquad K = \\frac{1}{2\\cdot 0.5^{2+\\alpha}\\, f(x_k - x_1)}",
    params: [{ tex: "\\alpha = 0.8\\quad (\\alpha > 0)" }, { tex: ALIENATIONS_TEX }, K_AUTO],
    references: ["esteban1994"],
    beta: false,
    credit: null,
    onlyFive: false,
  },
  {
    id: "EMDPol",
    name: "EMD-pol",
    formula:
      "\\mathrm{EMD}_{\\mathrm{pol}}(\\pi) = 0.5 - \\mathrm{EMD}(\\pi, \\pi^{*}), \\qquad \\pi^{*} = \\tfrac12\\,\\delta_{x_1} + \\tfrac12\\,\\delta_{x_k}",
    params: [],
    references: ["lupu2017"],
    beta: false,
    credit: null,
    onlyFive: false,
  },
  {
    id: "Experts",
    name: "Experts",
    formula:
      "\\mathrm{Experts}(\\pi) = \\frac{2.14\\,\\pi_2\\pi_4 + 2.70\\,(\\pi_1\\pi_4 + \\pi_2\\pi_5) + 3.96\\,\\pi_1\\pi_5}{100 \\cdot 0.0099\\,\\left(\\sum_i \\pi_i\\right)^{2}}",
    params: [],
    references: ["koudenburg2021"],
    beta: false,
    credit: null,
    onlyFive: true,
  },
  {
    id: "ShannonPol",
    name: "Shannon-pol",
    formula:
      "\\mathrm{Shannon}_{\\mathrm{pol}}(\\pi) = -\\sum_{i} \\pi_i \\log_2\\!\\left(1 - \\frac{|x_i - \\mu|}{x_k - x_1}\\right), \\qquad \\mu = \\sum_i \\pi_i x_i",
    params: [],
    references: ["tastle2007"],
    beta: false,
    credit: null,
    onlyFive: false,
  },
  {
    id: "VanDerEijkPol",
    name: "Van der Eijk-pol",
    formula:
      "\\mathrm{Eijk}_{\\mathrm{pol}}(\\pi) = 1 - \\frac{1 + A}{2}, \\qquad A = \\sum_{\\ell} w_\\ell\\, U_\\ell \\left(1 - \\frac{S_\\ell - 1}{k - 1}\\right)",
    params: [],
    references: ["vanDerEijk2001"],
    beta: false,
    credit: null,
    onlyFive: false,
  },
];

export const PROPOSED_DOCS: readonly MeasureDoc[] = [
  {
    id: "MEC",
    name: "MEC",
    formula:
      "\\mathrm{MEC}_{\\alpha,\\beta}(\\pi) = \\min_{y \\in [0,1]} \\sum_{i} \\pi_i^{\\alpha}\\,|x_i - y|^{\\beta}",
    params: [ALPHA_MEC, BETA_MEC],
    references: ["aranda2026"],
    beta: false,
    credit: null,
    onlyFive: false,
  },
  {
    id: "MECNormalized",
    name: "MEC normalized",
    formula:
      "\\mathrm{MEC}^{*}_{\\alpha,\\beta}(\\pi) = \\left(\\frac{\\mathrm{MEC}_{\\alpha,\\beta}(\\pi)}{\\mathrm{MEC}_{\\alpha,\\beta}(\\pi^{*})}\\right)^{1/\\beta}",
    params: [ALPHA_MEC, BETA_MEC],
    references: ["aranda2026"],
    beta: true,
    credit: null,
    onlyFive: false,
  },
  {
    id: "GeneralizedMEC",
    name: "Generalized MEC",
    formula:
      "\\mathrm{MEC}_{\\alpha,f}(\\pi) = \\min_{y \\in [0,1]} \\sum_{i} \\pi_i^{\\alpha}\\, f(|x_i - y|)",
    params: [ALPHA_MEC, { tex: ALIENATIONS_TEX }],
    references: ["aranda2026"],
    beta: false,
    credit: null,
    onlyFive: false,
  },
  {
    id: "BiPol",
    name: "BiPol",
    formula:
      "\\mathrm{BiPol}(\\pi) = 4\\,\\pi(L)\\,\\pi(R)\\,(\\mu_R - \\mu_L), \\qquad L = \\{x_i < \\mu\\},\\ R = \\{x_i \\ge \\mu\\}",
    params: [],
    references: [],
    beta: false,
    credit: "Carlos Pinzón",
    onlyFive: false,
  },
];

/** The package's kmeans thresholds for 3 levels (measures.thresholds), by calibrated parameters. */
export const LEVEL_DOCS: ReadonlyArray<{
  id: MeasureDocId;
  name: string;
  paramsTex: string;
  lowMedium: number;
  mediumHigh: number;
}> = [
  {
    id: "EstebanRay",
    name: "Esteban–Ray",
    paramsTex: "\\alpha = 0.8",
    lowMedium: 0.3791,
    mediumHigh: 0.5141,
  },
  { id: "BiPol", name: "BiPol", paramsTex: "", lowMedium: 0.4525, mediumHigh: 0.6267 },
  {
    id: "MECNormalized",
    name: "MEC normalized",
    paramsTex: "\\alpha = 2,\\ \\beta = 1.15",
    lowMedium: 0.2233,
    mediumHigh: 0.3801,
  },
];
