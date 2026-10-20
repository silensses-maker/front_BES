import { type AlienationId, isInRange, type ParamSpec } from "@/shared/lib/polarization";

type NumericSpec = Exclude<ParamSpec, { kind: "choice" }>;

export type ParamInputResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: "number" | "range" };

/**
 * Parses a parameter field. Accepts a decimal comma (es), an empty optional field means "auto"
 * (null, the package default normalization), and values outside the package's range are rejected.
 */
export function parseParamInput(spec: NumericSpec, raw: string): ParamInputResult {
  const text = raw.trim().replace(",", ".");
  if (text === "") {
    return spec.kind === "optional-number"
      ? { ok: true, value: null }
      : { ok: false, reason: "number" };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "number" };
  if (!isInRange(spec, value)) return { ok: false, reason: "range" };
  return { ok: true, value };
}

/** Field text for a stored value (empty = auto). */
export function formatParamValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The range of a numeric parameter as shown to the user, e.g. "(0, 1.6]" or "> 0". */
export function rangeText(spec: NumericSpec): string {
  if (spec.kind === "number" && spec.max !== null) return `(${spec.minExclusive}, ${spec.max}]`;
  return `> ${spec.minExclusive}`;
}

const ALIENATION_TEXT: Readonly<Record<AlienationId, string>> = {
  d: "d",
  "d^2": "d²",
  "d^3": "d³",
  "d+d^2": "d + d²",
  "d+2d^2": "d + 2d²",
  "exp(d)-1": "eᵈ − 1",
  "exp(2d)-1": "e²ᵈ − 1",
};

/** Plain-text label of an alienation function (selects); the wiki uses `ALIENATION_TEX`. */
export function alienationLabel(id: AlienationId): string {
  return ALIENATION_TEXT[id];
}

/** Measure value as shown next to the chart (4 decimals, locale separators). */
export function formatMeasureValue(value: number | null, lang: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(lang, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
