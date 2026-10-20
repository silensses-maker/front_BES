import type { UaMemoryResult } from "./environment";
import type { PhaseRecording } from "./frame-recorder";
import { summarizeFrames } from "./frame-stats";
import type { BenchPhaseName, PhaseResult } from "./result-schema";

export interface PhaseResultInput {
  phase: BenchPhaseName;
  variant?: string | null;
  warmupMs: number;
  measureMs: number;
  recording: PhaseRecording;
  refreshIntervalMs: number | null;
  uaMemory?: UaMemoryResult | null;
  repaint?: { speed: number; baseRps: number; roundsRendered: number } | null;
}

/** One measured window → the exported phase result (same stats for the suite and the HUD). */
export function toPhaseResult(input: PhaseResultInput): PhaseResult {
  const { recording } = input;
  const actualMs = Math.max(0, recording.endedAt - recording.startedAt);
  const repaint = input.repaint ?? null;
  return {
    phase: input.phase,
    variant: input.variant ?? null,
    warmupMs: input.warmupMs,
    measureMs: input.measureMs,
    actualMs,
    frames: summarizeFrames(recording.deltas, input.refreshIntervalMs),
    longTasks: recording.longTasks,
    heap: recording.heap,
    uaMemory: input.uaMemory ?? null,
    repaint:
      repaint === null
        ? null
        : {
            speed: repaint.speed,
            targetRoundsPerSecond: repaint.speed * repaint.baseRps,
            roundsRendered: repaint.roundsRendered,
            repaintsPerSecond: actualMs > 0 ? (1000 * repaint.roundsRendered) / actualMs : 0,
          },
  };
}
