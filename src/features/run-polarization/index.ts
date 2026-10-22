/**
 * Polarization UI (#129): the run charts' Polarization view (values computed on the server by
 * pol_measures, as a chart or a table with its CSV export) and the wiki section. Remove together with src/shared/lib/polarization (see
 * README, "Polarization measures").
 */
export { type LineDash, slotStyle } from "./lib/series-style";
export { MAX_SERIES } from "./model/series-list";
export { PolarizationPanel, type PolarizationPanelProps } from "./ui/lazy-polarization-panel";
// The compared series' line sample (the user manual shows the ten series styles with it)
export { LineSample } from "./ui/line-sample";
export { PolarizationWikiSection } from "./ui/polarization-wiki-section";
