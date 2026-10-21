import { type AxisMode, normalizeValue, type ValueRange } from "./normalize";
import { formatMeasureValue, formatShapeValue } from "./param-input";
import { type LineDash, sampleShape } from "./series-style";

/**
 * HTML of the polarization chart's axis tooltip (#129). Names come from the server's catalog and
 * values from the UI's formatters: everything is escaped before it reaches ECharts' HTML tooltip.
 */

export interface TooltipRow {
  /** Line sample colour (null = no sample: the single-series tooltip). */
  color: string | null;
  /** The series' line style, for its sample (solid when missing). */
  dash?: LineDash;
  name: string;
  /** The value drawn at that round (bold). */
  value: string;
  /** Extra facts after the value (the real value in the normalized mode, the level). */
  details: readonly string[];
}

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  let out = "";
  for (const char of text) out += ENTITIES[char] ?? char;
  return out;
}

/**
 * The series' line sample (its colour and dash, as the chart draws it), decorative: the row's
 * name identifies the series.
 */
export function lineSampleHtml(color: string, dash: LineDash): string {
  const shape = sampleShape(dash);
  const stroke = escapeHtml(color);
  const { x1, y1, x2, y2 } = shape.line;
  const dasharray = shape.dasharray === null ? "" : ` stroke-dasharray="${shape.dasharray}"`;
  return (
    `<svg aria-hidden="true" focusable="false" width="${shape.width}" height="${shape.height}" ` +
    `viewBox="0 0 ${shape.width} ${shape.height}" ` +
    `style="display:inline-block;vertical-align:middle;margin:-2px 5px 0 0">` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${shape.strokeWidth}"` +
    `${dasharray} stroke-linecap="${shape.cap}"/></svg>`
  );
}

export function tooltipHtml(head: string, rows: readonly TooltipRow[]): string {
  const lines = rows.map((row) => {
    const details = row.details.map((detail) => ` · ${escapeHtml(detail)}`).join("");
    const marker = row.color === null ? "" : lineSampleHtml(row.color, row.dash ?? "solid");
    return `${marker}${escapeHtml(row.name)}: <b>${escapeHtml(row.value)}</b>${details}`;
  });
  return [escapeHtml(head), ...lines].join("<br/>");
}

/** A series' facts at the hovered round. */
export interface TooltipSeries {
  name: string;
  color: string;
  dash: LineDash;
  /** The real value (null = none at that round). */
  value: number | null;
  /** The package's level, as the server answered it (null = none). */
  level: string | null;
  /** The series' min–max, for its normalized value. */
  range: ValueRange | null;
}

export interface TooltipFormat {
  lang: string;
  level: (level: string) => string;
  /** The real value next to a normalized one, e.g. "value 0.4521". */
  realValue: (formatted: string) => string;
  /** Name of the normalized mode, added to the head. */
  normalized: string;
}

/**
 * The axis tooltip of the polarization chart. One series (`compare` false): its value and level,
 * as before the comparison. Compared series: a row per series with its line sample, its value and
 * its level; in the normalized mode the row shows the normalized (shape) value and the real one.
 */
export function polarizationTooltip(
  head: string,
  series: readonly TooltipSeries[],
  view: { compare: boolean; axisMode: AxisMode },
  format: TooltipFormat,
): string {
  const normalized = view.compare && view.axisMode === "normalized";
  const rows = series.map((item): TooltipRow => {
    const real = formatMeasureValue(item.value, format.lang);
    const level = item.value !== null && item.level ? [format.level(item.level)] : [];
    if (normalized) {
      return {
        color: item.color,
        dash: item.dash,
        name: item.name,
        value: formatShapeValue(normalizeValue(item.value, item.range), format.lang),
        details: [format.realValue(real), ...level],
      };
    }
    return {
      color: view.compare ? item.color : null,
      dash: item.dash,
      name: item.name,
      value: real,
      details: level,
    };
  });
  return tooltipHtml(normalized ? `${head} · ${format.normalized}` : head, rows);
}
