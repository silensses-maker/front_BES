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
});
