/**
 * Left offset (px, relative to the container) of a hover tooltip centred on `anchorX`, clamped so
 * the tooltip stays inside the container. Centred tooltips near an edge used to stick out of the
 * timeline and give the whole page a horizontal scrollbar. A tooltip wider than the container is
 * aligned to its left edge.
 */
export function clampTooltipLeft(
  anchorX: number,
  tooltipWidth: number,
  containerWidth: number,
): number {
  const maxLeft = Math.max(0, containerWidth - tooltipWidth);
  return Math.min(Math.max(anchorX - tooltipWidth / 2, 0), maxLeft);
}
