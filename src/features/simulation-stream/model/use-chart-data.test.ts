import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSimulationStore } from "@/entities/simulation";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { useChartData } from "./use-chart-data";

// ─── Module mocks ────────────────────────────────────────────────────────────

const { mockGetState, mockSubscribe } = vi.hoisted(() => ({
  mockGetState: vi.fn(),
  mockSubscribe: vi.fn(),
}));

vi.mock("@/entities/simulation", () => {
  const useStore = vi.fn() as unknown as ReturnType<typeof vi.fn> & {
    getState: typeof mockGetState;
    subscribe: typeof mockSubscribe;
  };
  useStore.getState = mockGetState;
  useStore.subscribe = mockSubscribe;
  return { useSimulationStore: useStore };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────

const strategyLabel = (v: number) => `s${v}`;
const effectLabel = (v: number) => `e${v}`;

function makeTopology(agents: Array<{ silenceStrategy: number; silenceEffect: number }>) {
  return {
    runId: "run-1",
    networkId: "net-1",
    agentCount: agents.length,
    edgeCount: 0,
    agentOffset: 0,
    agentLimit: 100,
    edgeOffset: 0,
    edgeLimit: 100,
    agents: agents.map((a, index) => ({
      index,
      name: null,
      initialBelief: 0.5,
      toleranceRadius: 0,
      toleranceOffset: 0,
      ...a,
    })),
    edges: [],
  };
}

// Uses exact float32 values (1/8, 5/8) to avoid bucket-rounding flake.
function makeFrame(round: number): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array([0.125, 0.625]),
    privateBelief: new Float32Array([0.25, 0.75]),
    speaking: new Uint8Array([1, 0]),
  };
}

/** Captures the store.subscribe listener so tests can push frames. */
let storeListener: ((state: { latestFrame: MergedFrame | null }) => void) | null = null;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useChartData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeListener = null;
    mockGetState.mockReturnValue({ latestFrame: null });
    mockSubscribe.mockImplementation((cb: typeof storeListener) => {
      storeListener = cb;
      return () => {
        storeListener = null;
      };
    });
    // Synchronous rAF so setChartData flushes within the same act().
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setTopology(topology: ReturnType<typeof makeTopology> | null) {
    vi.mocked(useSimulationStore).mockImplementation((selector) =>
      (selector as (s: unknown) => unknown)({ topology }),
    );
  }

  it("returns empty chart data when there is no topology", () => {
    setTopology(null);
    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    expect(result.current.strategyPie).toEqual([]);
    expect(result.current.effectPie).toEqual([]);
    expect(result.current.beliefTimeline).toEqual([]);
    expect(result.current.beliefHistogram).toEqual([]);
  });

  it("derives strategy and effect pies from topology agents", () => {
    setTopology(
      makeTopology([
        { silenceStrategy: 0, silenceEffect: 0 },
        { silenceStrategy: 0, silenceEffect: 1 },
        { silenceStrategy: 2, silenceEffect: 1 },
      ]),
    );

    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    expect(result.current.strategyPie).toEqual([
      { name: "s0", value: 2 },
      { name: "s2", value: 1 },
    ]);
    expect(result.current.effectPie).toEqual([
      { name: "e0", value: 1 },
      { name: "e1", value: 2 },
    ]);
  });

  it("accumulates timelines and histogram from an incoming frame", () => {
    setTopology(makeTopology([{ silenceStrategy: 0, silenceEffect: 0 }]));
    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    act(() => {
      storeListener?.({ latestFrame: makeFrame(5) });
    });

    expect(result.current.beliefTimeline).toEqual([
      { round: 5, meanPublic: expect.closeTo(0.375, 5), meanPrivate: expect.closeTo(0.5, 5) },
    ]);
    expect(result.current.speakingTimeline).toEqual([{ round: 5, rate: expect.closeTo(0.5, 5) }]);
    // 20 buckets; 0.125 → bucket 2, 0.625 → bucket 12.
    expect(result.current.beliefHistogram).toHaveLength(20);
    expect(result.current.beliefHistogram[2]).toBe(1);
    expect(result.current.beliefHistogram[12]).toBe(1);
  });

  it("processes a frame already present in the store on mount", () => {
    setTopology(makeTopology([{ silenceStrategy: 0, silenceEffect: 0 }]));
    mockGetState.mockReturnValue({ latestFrame: makeFrame(3) });

    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    expect(result.current.beliefTimeline).toHaveLength(1);
    expect(result.current.beliefTimeline[0]?.round).toBe(3);
  });

  it("skips duplicate frames with the same reference", () => {
    setTopology(makeTopology([{ silenceStrategy: 0, silenceEffect: 0 }]));
    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));
    const frame = makeFrame(7);

    act(() => {
      storeListener?.({ latestFrame: frame });
      storeListener?.({ latestFrame: frame });
    });

    expect(result.current.beliefTimeline).toHaveLength(1);
  });

  it("ignores null latestFrame pushes", () => {
    setTopology(makeTopology([{ silenceStrategy: 0, silenceEffect: 0 }]));
    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    act(() => {
      storeListener?.({ latestFrame: null });
    });

    expect(result.current.beliefTimeline).toEqual([]);
  });

  it("computes zero means, rate, and an all-zero histogram for a frame with no agents", () => {
    setTopology(makeTopology([{ silenceStrategy: 0, silenceEffect: 0 }]));
    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    const emptyFrame: MergedFrame = {
      runId: "run-1",
      networkId: "net-1",
      round: 9,
      publicBelief: new Float32Array([]),
      privateBelief: new Float32Array([]),
      speaking: new Uint8Array([]),
    };

    act(() => {
      storeListener?.({ latestFrame: emptyFrame });
    });

    expect(result.current.beliefTimeline).toEqual([{ round: 9, meanPublic: 0, meanPrivate: 0 }]);
    expect(result.current.speakingTimeline).toEqual([{ round: 9, rate: 0 }]);
    expect(result.current.beliefHistogram).toHaveLength(20);
    expect(result.current.beliefHistogram.every((v) => v === 0)).toBe(true);
  });

  it("treats missing per-agent entries as 0 and drops out-of-range beliefs into an unfilled bucket", () => {
    setTopology(makeTopology([{ silenceStrategy: 0, silenceEffect: 0 }]));
    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    // Deliberately malformed frame (real merger output always has three
    // equal-length arrays — see simulation-frame-merger.ts) to exercise the
    // `?? 0` guards: index 0 of publicBelief is missing entirely, and
    // privateBelief/speaking are shorter than publicBelief so their last
    // index is missing too. publicBelief[1] is negative, which is outside
    // the [0, 1) domain real beliefs live in and produces a negative bucket
    // index — a defensive edge case for upstream data glitches.
    const malformedFrame: MergedFrame = {
      runId: "run-1",
      networkId: "net-1",
      round: 11,
      publicBelief: [undefined, -0.1, 0.3, 0.9] as unknown as Float32Array,
      privateBelief: new Float32Array([0.2, 0.4, 0.6]),
      speaking: new Uint8Array([1, 0, 1]),
    };

    act(() => {
      storeListener?.({ latestFrame: malformedFrame });
    });

    expect(result.current.beliefTimeline).toEqual([
      { round: 11, meanPublic: expect.closeTo(0.275, 5), meanPrivate: expect.closeTo(0.3, 5) },
    ]);
    expect(result.current.speakingTimeline).toEqual([{ round: 11, rate: expect.closeTo(0.5, 5) }]);
    // 3 of the 4 belief values land in-range (buckets 0, 6, 18); the negative
    // value's bucket falls outside the 20-slot histogram and is not visible here.
    expect(result.current.beliefHistogram).toHaveLength(20);
    expect(result.current.beliefHistogram[0]).toBe(1);
    expect(result.current.beliefHistogram[6]).toBe(1);
    expect(result.current.beliefHistogram[18]).toBe(1);
    expect(result.current.beliefHistogram.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("caps each timeline at 500 rounds by dropping the oldest entry", () => {
    // A real rAF only invokes its callback later (on the next paint), never
    // synchronously. Capture it instead of auto-firing so rafRef stays
    // "pending" across pushes, matching production and letting us assert on
    // the fully-accumulated ref state via a single manual flush.
    let pendingCb: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pendingCb = cb;
      return 1;
    });

    setTopology(makeTopology([{ silenceStrategy: 0, silenceEffect: 0 }]));
    const { result } = renderHook(() => useChartData(strategyLabel, effectLabel));

    act(() => {
      for (let round = 1; round <= 501; round++) {
        storeListener?.({ latestFrame: makeFrame(round) });
      }
    });

    act(() => {
      pendingCb?.(0);
    });

    expect(result.current.beliefTimeline).toHaveLength(500);
    expect(result.current.beliefTimeline[0]?.round).toBe(2);
    expect(result.current.beliefTimeline[499]?.round).toBe(501);
    expect(result.current.speakingTimeline).toHaveLength(500);
    expect(result.current.speakingTimeline[0]?.round).toBe(2);
    expect(result.current.speakingTimeline[499]?.round).toBe(501);
  });
});
