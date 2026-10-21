import type {
  PolarizationAlienation,
  PolarizationMeasureInfo,
  PolarizationParamValue,
} from "@/shared/api/backend";
import type { BeliefKind } from "@/shared/lib/polarization";
import { alienationLabel, paramSymbol } from "./param-input";

/**
 * Short label of a compared series (#129), for its chip, the legend and the tooltip: the measure
 * name, k and the belief type, then the parameters that differ from the package's defaults
 * (e.g. "MEC · k=5 · private · α=1,5").
 */

export interface SeriesLabelInput {
  measure: PolarizationMeasureInfo;
  /** Effective parameters (the catalog's defaults overridden by the edited ones). */
  params: Readonly<Record<string, PolarizationParamValue>>;
  k: number;
  belief: BeliefKind;
}

export interface SeriesLabelText {
  lang: string;
  /** "private" / "public" in the UI language. */
  belief: (belief: BeliefKind) => string;
  /** Text of an empty nullable parameter (K = automatic). */
  auto: string;
  alienations: readonly PolarizationAlienation[];
}

const SEPARATOR = " · ";

function paramText(
  name: string,
  value: PolarizationParamValue,
  isChoice: boolean,
  text: SeriesLabelText,
): string {
  if (isChoice) return `f(d)=${alienationLabel(text.alienations, String(value))}`;
  const shown =
    typeof value === "number"
      ? value.toLocaleString(text.lang, { maximumFractionDigits: 6 })
      : (value ?? text.auto);
  return `${paramSymbol(name)}=${shown}`;
}

/** The parts of a label: the measure, k, the belief type and the non-default parameters. */
export interface SeriesLabelParts {
  measure: string;
  k: string;
  belief: string;
  params: string[];
}

export function seriesLabelParts(
  { measure, params, k, belief }: SeriesLabelInput,
  text: SeriesLabelText,
): SeriesLabelParts {
  const edited: string[] = [];
  for (const spec of measure.params) {
    const value = params[spec.name] ?? null;
    if (value === spec.default) continue;
    edited.push(paramText(spec.name, value, spec.type === "choice", text));
  }
  return { measure: measure.name, k: `k=${k}`, belief: text.belief(belief), params: edited };
}

export function joinLabel(parts: readonly string[]): string {
  return parts.join(SEPARATOR);
}

export function seriesLabel(input: SeriesLabelInput, text: SeriesLabelText): string {
  const parts = seriesLabelParts(input, text);
  return joinLabel([parts.measure, parts.k, parts.belief, ...parts.params]);
}

/**
 * Labels made unique (the legend and the CSV's wide headers identify series by name): a repeated
 * label gets " (2)", " (3)"… in order, e.g. a copy not changed yet. A suffix that would collide
 * with another label of the list is skipped, so the result is always unique.
 */
export function uniqueLabels(labels: readonly string[]): string[] {
  const given = new Set(labels);
  const used = new Set<string>();
  const counts = new Map<string, number>();
  return labels.map((label) => {
    if (!used.has(label)) {
      used.add(label);
      return label;
    }
    let count = counts.get(label) ?? 1;
    let candidate: string;
    do {
      count++;
      candidate = `${label} (${count})`;
    } while (used.has(candidate) || given.has(candidate));
    counts.set(label, count);
    used.add(candidate);
    return candidate;
  });
}
