import type { BenchProbeEvent } from "@/shared/lib/bench-probe";
import { distribution } from "./phase-result";
import type { RepaintBreakdown } from "./result-schema";

/** One round pushed by the playback driver. */
export interface RoundRecord {
  /** Round number stored in the frame (the canvas reports it back on commit). */
  round: number;
  /** When `store.updateFrame` was called. */
  showAt: number;
  /** Replay merge of the round. */
  mergeMs: number;
}

/**
 * Per-round timings of the repaint path (#126 v2) from the driver's records and the high-frequency
 * probe events captured in the window: frame commits matched to their round, Cosmograph
 * setConfig durations and colour updates.
 */
export function computeRepaintBreakdown(input: {
  rounds: readonly RoundRecord[];
  events: readonly BenchProbeEvent[];
  windowStart: number;
  windowEnd: number;
  frameMs: number | null;
  longTaskMs: number | null;
}): RepaintBreakdown {
  const inWindow = input.events.filter((e) => e.at >= input.windowStart && e.at <= input.windowEnd);
  const commits = input.events.filter((e) => e.name === "canvas-frame-commit");
  const used = new Set<BenchProbeEvent>();
  const commitMs: number[] = [];
  for (const r of input.rounds) {
    const commit = commits.find(
      (e) => !used.has(e) && e.detail.round === r.round && e.at >= r.showAt,
    );
    if (commit === undefined) continue;
    used.add(commit);
    commitMs.push(commit.at - r.showAt);
  }
  const configs = inWindow.filter((e) => e.name === "cosmograph-config-done");
  const seconds = (input.windowEnd - input.windowStart) / 1000;
  return {
    rounds: input.rounds.length,
    mergeMs: distribution(input.rounds.map((r) => r.mergeMs)),
    commitMs: distribution(commitMs),
    cosmographUpdates: configs.length,
    cosmographUpdateMs: distribution(configs.map((e) => e.detail.durationMs ?? 0)),
    cosmographSyncMs: distribution(configs.map((e) => e.detail.syncMs ?? 0)),
    colorUpdates: inWindow.filter((e) => e.name === "cosmograph-colors-updated").length,
    frameMs: input.frameMs,
    longTaskMsPerSecond:
      input.longTaskMs !== null && seconds > 0 ? input.longTaskMs / seconds : null,
  };
}
