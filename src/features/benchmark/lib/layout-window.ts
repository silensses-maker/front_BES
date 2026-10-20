import type { BenchProbeEvent, BenchProbeName } from "@/shared/lib/bench-probe";

/**
 * Where a layout window starts (#126 v2): at the first frame Cosmograph draws with the data —
 * its first simulation tick after the LAST data event (`graphRebuilt` for the initial layout,
 * `clustersUpdated` / `graphRebuilt` for a grouping change) inside [from, to]. Before that, the
 * canvas either draws nothing new (fast, empty frames) or is blocked uploading the data; version
 * 1 mixed both into the layout statistics.
 */
export function chooseWindowStart(
  events: readonly BenchProbeEvent[],
  options: { from: number; to: number; dataEvents: readonly BenchProbeName[] },
): number | null {
  const inRange = events.filter((e) => e.at >= options.from && e.at <= options.to);
  let after = options.from;
  for (const e of inRange) if (options.dataEvents.includes(e.name)) after = e.at;
  const tick = inRange.find((e) => e.name === "cosmograph-first-tick" && e.at >= after);
  return tick?.at ?? null;
}
