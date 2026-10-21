import { type LineDash, sampleShape } from "../lib/series-style";

/**
 * A compared series' line sample (#129): a short line in its colour and dash, as the chart
 * draws it (chips, settings, notices, round values, table headers). Decorative: the series'
 * name next to it, or its control's label, identifies the series.
 */
export function LineSample({ color, dash }: { color: string; dash: LineDash }) {
  const shape = sampleShape(dash);
  const { x1, y1, x2, y2 } = shape.line;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-dash={dash}
      width={shape.width}
      height={shape.height}
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      className="flex-none"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={shape.strokeWidth}
        strokeDasharray={shape.dasharray ?? undefined}
        strokeLinecap={shape.cap}
      />
    </svg>
  );
}
