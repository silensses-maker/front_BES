import { useEffect, useMemo, useRef, useState } from "react";
import { useSimulationStore } from "@/entities/simulation";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";

export interface ChartData {
  strategyPie: Array<{ name: string; value: number }>;
  effectPie: Array<{ name: string; value: number }>;
  beliefTimeline: Array<{ round: number; meanPublic: number; meanPrivate: number }>;
  speakingTimeline: Array<{ round: number; rate: number }>;
  beliefHistogram: number[]; // length 20
}

const emptyChartData: ChartData = {
  strategyPie: [],
  effectPie: [],
  beliefTimeline: [],
  speakingTimeline: [],
  beliefHistogram: [],
};

export function useChartData(
  strategyLabel: (v: number) => string,
  effectLabel: (v: number) => string,
): ChartData {
  const topology = useSimulationStore((s) => s.topology);

  const beliefTimelineRef = useRef<
    Array<{ round: number; meanPublic: number; meanPrivate: number }>
  >([]);
  const speakingTimelineRef = useRef<Array<{ round: number; rate: number }>>([]);
  const histogramRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  // Tracks the last frame processed to skip duplicates (initial-frame check +
  // subscribe callback can both see the same reference on first mount).
  const lastFrameRef = useRef<MergedFrame | null>(null);
  // Timelines are append-only: frames from a backward replay seek (round lower
  // than what was already accumulated) must be ignored, not appended.
  const lastRoundRef = useRef(-1);

  const [chartData, setChartData] = useState<ChartData>(emptyChartData);

  // Derive static pie data from topology agents
  const strategyPie = useMemo(() => {
    if (!topology?.agents) return [];
    const counts: Record<number, number> = {};
    for (const agent of topology.agents) {
      const s = agent.silenceStrategy;
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: strategyLabel(Number(k)), value: v }));
  }, [topology, strategyLabel]);

  const effectPie = useMemo(() => {
    if (!topology?.agents) return [];
    const counts: Record<number, number> = {};
    for (const agent of topology.agents) {
      const e = agent.silenceEffect;
      counts[e] = (counts[e] ?? 0) + 1;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: effectLabel(Number(k)), value: v }));
  }, [topology, effectLabel]);

  // Reset timelines when topology changes (pies are derived from topology,
  // so their identity changing signals a network switch).
  useEffect(() => {
    beliefTimelineRef.current = [];
    speakingTimelineRef.current = [];
    histogramRef.current = [];
    lastFrameRef.current = null;
    lastRoundRef.current = -1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setChartData({ ...emptyChartData, strategyPie, effectPie });
  }, [strategyPie, effectPie]);

  // Subscribe directly to the store — fires synchronously on every set, so
  // every frame is accumulated even when React batches multiple store updates
  // into one render (which happens during REST replay bursts from the worker).
  useEffect(() => {
    function processFrame(frame: MergedFrame): void {
      if (frame === lastFrameRef.current) return;
      lastFrameRef.current = frame;
      if (frame.round <= lastRoundRef.current) return;
      lastRoundRef.current = frame.round;

      const len = frame.publicBelief.length;
      let sumPublic = 0;
      let sumPrivate = 0;
      let speakingCount = 0;
      for (let i = 0; i < len; i++) {
        sumPublic += frame.publicBelief[i] ?? 0;
        sumPrivate += frame.privateBelief[i] ?? 0;
        speakingCount += frame.speaking[i] ?? 0;
      }
      const meanPublic = len > 0 ? sumPublic / len : 0;
      const meanPrivate = len > 0 ? sumPrivate / len : 0;
      const rate = len > 0 ? speakingCount / len : 0;

      const histogram = new Array<number>(20).fill(0);
      for (let i = 0; i < len; i++) {
        const belief = frame.publicBelief[i] ?? 0;
        const bucket = Math.min(19, Math.floor(belief * 20));
        histogram[bucket] = (histogram[bucket] ?? 0) + 1;
      }
      histogramRef.current = histogram;

      if (beliefTimelineRef.current.length >= 500) beliefTimelineRef.current.shift();
      beliefTimelineRef.current.push({ round: frame.round, meanPublic, meanPrivate });

      if (speakingTimelineRef.current.length >= 500) speakingTimelineRef.current.shift();
      speakingTimelineRef.current.push({ round: frame.round, rate });

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setChartData({
            strategyPie,
            effectPie,
            beliefTimeline: [...beliefTimelineRef.current],
            speakingTimeline: [...speakingTimelineRef.current],
            beliefHistogram: [...histogramRef.current],
          });
        });
      }
    }

    // Catch any frame already in the store (component mounted after sim started).
    const initial = useSimulationStore.getState().latestFrame;
    if (initial !== null) processFrame(initial);

    const unsub = useSimulationStore.subscribe((state) => {
      if (state.latestFrame !== null) processFrame(state.latestFrame);
    });

    return () => {
      unsub();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [strategyPie, effectPie]);

  return chartData;
}
