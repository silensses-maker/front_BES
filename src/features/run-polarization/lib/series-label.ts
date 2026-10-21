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

export function seriesLabel(
  { measure, params, k, belief }: SeriesLabelInput,
  text: SeriesLabelText,
): string {
  const parts = [measure.name, `k=${k}`, text.belief(belief)];
  for (const spec of measure.params) {
    const value = params[spec.name] ?? null;
    if (value === spec.default) continue;
    parts.push(paramText(spec.name, value, spec.type === "choice", text));
  }
  return parts.join(SEPARATOR);
}

/**
 * Labels made unique (the legend identifies series by name): a repeated label gets " (2)",
 * " (3)"… in order, e.g. a copy not changed yet.
 */
export function uniqueLabels(labels: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label} (${count})`;
  });
}
