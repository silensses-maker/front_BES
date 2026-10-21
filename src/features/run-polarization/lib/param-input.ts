import type {
  PolarizationAlienation,
  PolarizationNumberParam,
  PolarizationParamValue,
} from "@/shared/api/backend";

export type ParamInputResult =
  | { ok: true; value: number | null }
  | { ok: false; reason: "number" | "range" };

/** Whether a number is inside a parameter's range as the server's catalog states it. */
export function isInRange(spec: PolarizationNumberParam, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (spec.minExclusive !== null && value <= spec.minExclusive) return false;
  return spec.max === null || value <= spec.max;
}

/**
 * Parses a parameter field. Accepts a decimal comma (es); an empty nullable field means "auto"
 * (null, the package's default); values outside the catalog's range are rejected (the server
 * would answer 422).
 */
export function parseParamInput(spec: PolarizationNumberParam, raw: string): ParamInputResult {
  const text = raw.trim().replace(",", ".");
  if (text === "") {
    return spec.nullable ? { ok: true, value: null } : { ok: false, reason: "number" };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "number" };
  if (!isInRange(spec, value)) return { ok: false, reason: "range" };
  return { ok: true, value };
}

/** Field text for a stored value (empty = auto). */
export function formatParamValue(value: PolarizationParamValue | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** The range of a numeric parameter as shown to the user, e.g. "(0, 1.6]" or "> 0" ("" = any). */
export function rangeText(spec: PolarizationNumberParam): string {
  if (spec.minExclusive !== null && spec.max !== null) return `(${spec.minExclusive}, ${spec.max}]`;
  if (spec.minExclusive !== null) return `> ${spec.minExclusive}`;
  if (spec.max !== null) return `≤ ${spec.max}`;
  return "";
}

const SYMBOLS: Readonly<Record<string, string>> = { alpha: "α", beta: "β" };

/** Symbol of a parameter in labels (α, β; other names as they are, e.g. K). */
export function paramSymbol(name: string): string {
  return SYMBOLS[name] ?? name;
}

/** Plain-text label of an alienation function f(d) from the catalog (its id when unknown). */
export function alienationLabel(
  alienations: readonly PolarizationAlienation[],
  id: string,
): string {
  return alienations.find((a) => a.id === id)?.label ?? id;
}

/** Measure value as shown next to the chart (4 decimals, locale separators). */
export function formatMeasureValue(value: number | null, lang: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(lang, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Normalized (shape) value as shown in the comparison tooltip (2 decimals, locale separators). */
export function formatShapeValue(value: number | null, lang: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
