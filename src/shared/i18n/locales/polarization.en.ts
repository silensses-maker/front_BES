/**
 * Polarization replica (#129) strings — merged into `en` as the `polarization` namespace only
 * while the replica is compiled in (`__POLARIZATION__`). Measure names are proper names and stay
 * untranslated (registry).
 */
const polarizationEn = {
  tab: "Polarization",
  measureLabel: "Polarization measure",
  groupLiterature: "Literature",
  groupProposed: "Proposed (PROMUEVA)",
  beta: "BETA",
  betaTip: "Still being developed by its authors",
  onlyFiveCategories: "k = 5 only",
  paramAria: "Parameter {{name}}",
  paramTip: "{{name}} · default {{value}} · range {{range}}",
  paramKTip: "Normalization constant K · empty = automatic, 1/(2·0.5^(2+α))",
  paramAuto: "auto",
  paramInvalid: "Not applied: allowed range {{range}}",
  alienationAria: "Alienation function f(d)",
  alienationTip: "Alienation function f applied to the opinion distance d",
  resetParamsAria: "Restore the default parameters",
  resetParamsTip: "Restore the package defaults",
  kAria: "Number of categories k",
  kTip: "Beliefs are grouped into k equal-width categories over [0, 1], at positions 0, 1/(k−1), …, 1. Experts needs k = 5.",
  beliefAria: "Belief type",
  beliefPrivate: "Private",
  beliefPublic: "Public",
  beliefTip: "Private: what the agents believe. Public: what they express.",
  valueAt: "Round {{round}}",
  tooltipRound: "Round {{round}}",
  levelTip: "Level of the viewed round from the package thresholds (k-means, 3 levels)",
  levels: {
    very_low: "very low",
    low: "low",
    medium: "medium",
    high: "high",
    very_high: "very high",
  },
  aboutAria: "About this measure",
  aboutWithLevels:
    "Computed per round by a replica of pol_measures (PROMUEVA). Dotted lines: level thresholds. Details in the wiki.",
  aboutNoLevels:
    "Computed per round by a replica of pol_measures (PROMUEVA). There are no level thresholds for this measure and these parameters. Details in the wiki.",
  unsupportedK: "{{name}} is only defined for 5 categories.",
  useFiveCategories: "Use k = 5",
  invalidParams: "These parameters are not valid for {{name}}.",
  wiki: {
    title: "Polarization measures",
    intro:
      "The Polarization chart of a run measures, round by round, how polarized the agents' beliefs are. The measures come from pol_measures, the PROMUEVA package of polarization measures, which SiLEnSeSS reproduces in the browser.",
    binningTitle: "From beliefs to a histogram",
    binning1: "Every measure takes an opinion histogram: k categories at the positions",
    binning2: "A belief",
    binning3: "falls in category",
    binning4: ", and each category weighs the fraction of agents in it,",
    binning5:
      "k is 5 by default (3, 7 and 10 are also available). The measures use the private beliefs by default (what the agents actually think) or the public ones (what they express).",
    literatureTitle: "Measures from the literature",
    proposedTitle: "Measures proposed by PROMUEVA",
    proposedIntro:
      "MEC (minimal effort to consensus) defines polarization as the least effort needed to bring the whole population to a single opinion.",
    params: "Parameters",
    noParams: "none",
    kAuto: "automatic (the default normalization)",
    onlyFive: "only defined for k = 5",
    credit: "implemented by {{name}}",
    reference: "Reference",
    meaning: {
      EstebanRay:
        "Large, internally homogeneous groups far apart from each other. α weights group identity.",
      GeneralizedER:
        "Esteban–Ray with an alienation function f applied to the distances, scaled so that half the population at each extreme scores 1.",
      EMDPol:
        "0.5 minus the Earth Mover's Distance to the most polarized distribution, half the population at each extreme.",
      Experts: "Index fitted to the ratings 60 experts gave to 15 five-point histograms.",
      ShannonPol:
        "Tastle–Wierman dissention: how far, in information terms, the population is from its mean opinion.",
      VanDerEijkPol:
        "Van der Eijk's agreement on ordered scales, turned into polarization (0 = full agreement). The histogram is split into layers; A is their weighted agreement.",
      MEC: "Least cost of moving everyone to one opinion y. α weights group size, β how fast the cost grows with distance.",
      MECNormalized:
        "MEC relative to the extreme split π* (half the population at each end), so π* scores 1.",
      GeneralizedMEC: "MEC with an alienation function f in place of the distance to the power β.",
      BiPol:
        "Splits the population at the mean; grows with the mass on each side and the gap between their means.",
    },
    levelsTitle: "Levels",
    levels1:
      "pol_measures publishes thresholds for three measures. When they apply, the chart draws them and labels the viewed round low, medium or high, with the package's default method (k-means) and three levels:",
    colMeasure: "Measure",
    colLowMedium: "low → medium",
    colMediumHigh: "medium → high",
    levels2: "Thresholds only apply to the parameters listed; any other value shows no level.",
    sourceTitle: "Source",
    source1:
      "Replica of pol_measures at commit {{commit}}, by {{author}}; BiPol implemented by {{bipol}}. Used with the authors' permission. Every measure is checked against values computed by the original package.",
    sourceLink: "pol_measures repository",
  },
} as const;

export default polarizationEn;
