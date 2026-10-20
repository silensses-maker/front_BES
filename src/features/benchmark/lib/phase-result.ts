import type { UaMemoryResult } from "./environment";
import type { PhaseRecording } from "./frame-recorder";
import { summarizeFrames } from "./frame-stats";
import type {
  BenchPhaseName,
  CanvasVariant,
  DistributionStat,
  LeadWindow,
  PhaseResult,
  RepaintBreakdown,
} from "./result-schema";

export interface PhaseResultInput {
  phase: BenchPhaseName;
  variant?: string | null;
  canvasVariant?: CanvasVariant;
  links?: { inData: number; drawn: number };
  warmupMs: number;
  measureMs: number;
  recording: PhaseRecording;
  refreshIntervalMs: number | null;
  uaMemory?: UaMemoryResult | null;
  repaint?: {
    speed: number;
    baseRps: number;
    roundsRendered: number;
    breakdown?: RepaintBreakdown | null;
  } | null;
  lead?: LeadWindow | null;
}

/** One measured window → the exported phase result (same stats for the suite and the HUD). */
export function toPhaseResult(input: PhaseResultInput): PhaseResult {
  const { recording } = input;
  const actualMs = Math.max(0, recording.endedAt - recording.startedAt);
  const repaint = input.repaint ?? null;
  return {
    phase: input.phase,
    variant: input.variant ?? null,
    ...(input.canvasVariant !== undefined && { canvasVariant: input.canvasVariant }),
    ...(input.links !== undefined && { links: input.links }),
    ...(input.lead !== undefined && { lead: input.lead }),
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
            ...(repaint.breakdown !== undefined && { breakdown: repaint.breakdown }),
          },
  };
}

/** The excluded interval before a layout window, summarized from its part of the recording. */
export function toLeadWindow(
  label: LeadWindow["label"],
  lead: PhaseRecording,
  startedBy: LeadWindow["startedBy"],
): LeadWindow {
  const max = lead.deltas.reduce((m, d) => Math.max(m, d), 0);
  return {
    label,
    durationMs: Math.max(0, lead.endedAt - lead.startedAt),
    startedBy,
    frames: lead.frameTimes.length,
    maxFrameMs: lead.deltas.length > 0 ? max : null,
    longTasks: lead.longTasks,
  };
}

/** Median, p95 and mean of a sample (nulls when empty). */
export function distribution(values: readonly number[]): DistributionStat {
  if (values.length === 0) return { median: null, p95: null, mean: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const rank = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    const a = sorted[lo] ?? 0;
    return a + ((sorted[hi] ?? a) - a) * (rank - lo);
  };
  return {
    median: at(50),
    p95: at(95),
    mean: values.reduce((s, v) => s + v, 0) / values.length,
  };
}
