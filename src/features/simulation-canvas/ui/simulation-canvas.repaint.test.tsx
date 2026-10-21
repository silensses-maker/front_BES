import { act, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, memo, useImperativeHandle } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSimulationStore } from "@/entities/simulation";
import type { TopologyResponse } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";
import { interpolateOpinion } from "@/shared/lib/opinion-palette";
import { TooltipProvider } from "@/shared/ui/tooltip";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { type FakeCosmos, fakeCosmos } from "@/test/fake-cosmos";
import { resetDirectRepaint } from "../lib/cosmos-direct";
import { buildColorBuffer, buildPointTables } from "../lib/point-colors";
import { SimulationCanvas } from "./simulation-canvas";

// ─── Mocks ────────────────────────────────────────────────────────────────────

/** Props of every <Cosmograph> render, and the instance its ref exposes. */
const cosmograph = vi.hoisted(() => ({
  renders: [] as Array<Record<string, unknown>>,
  instance: undefined as unknown,
}));

// Like the real wrapper: React.memo(forwardRef(…)) — it re-renders (and calls setConfig) only
// when a prop changes.
vi.mock("@cosmograph/react", () => ({
  Cosmograph: memo(
    forwardRef<unknown, Record<string, unknown>>(function FakeCosmograph(props, ref) {
      cosmograph.renders.push(props);
      useImperativeHandle(ref, () => cosmograph.instance);
      return null;
    }),
  ),
  prepareCosmographData: vi.fn(async () => ({
    points: { numRows: 3 },
    links: { numRows: 2 },
    cosmographConfig: { pointIdBy: "id" },
  })),
}));

// The Radix select is replaced by a native one to switch "Colorear por" in the test.
vi.mock("./color-by-select", () => ({
  ColorBySelect: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select aria-label="color-by" value={value} onChange={(e) => onChange(e.target.value)}>
      {["pub", "priv", "div", "estr"].map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const agent = (index: number, initialBelief: number, silenceStrategy: number) =>
  ({
    index,
    name: null,
    initialBelief,
    toleranceRadius: 0.1,
    toleranceOffset: 0,
    silenceStrategy,
    silenceEffect: 0,
  }) as TopologyResponse["agents"][number];

// Point order (topology order) differs from the agent indices.
const TOPOLOGY: TopologyResponse = {
  runId: "run-1",
  networkId: "net-1",
  agentCount: 3,
  edgeCount: 2,
  agentOffset: 0,
  agentLimit: 3,
  edgeOffset: 0,
  edgeLimit: 2,
  agents: [agent(2, 0.1, 0), agent(0, 0.5, 1), agent(1, 0.9, 2)],
  edges: [
    { source: 0, target: 1, influence: 0.5, bias: 1 },
    { source: 1, target: 2, influence: 0.5, bias: 1 },
  ] as TopologyResponse["edges"],
};
const TABLES = buildPointTables(TOPOLOGY.agents);

function frame(round: number, pub: number[], priv: number[], speaking: number[]): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array(pub),
    privateBelief: new Float32Array(priv),
    speaking: new Uint8Array(speaking),
  };
}

function expected(f: MergedFrame | null, colorBy: "pub" | "priv" | "div" | "estr") {
  const out = new Float32Array(TABLES.count * 4);
  buildColorBuffer(out, TABLES, colorBy, f);
  return out;
}

const lastProps = () => cosmograph.renders[cosmograph.renders.length - 1] ?? {};

async function mountCanvas() {
  const view = render(
    <MemoryRouter>
      <TooltipProvider>
        <SimulationCanvas status="running" topology={TOPOLOGY} />
      </TooltipProvider>
    </MemoryRouter>,
  );
  // prepareCosmographData resolves → the canvas mounts Cosmograph
  await act(async () => {});
  expect(cosmograph.renders.length).toBeGreaterThan(0);
  return view;
}

/** Cosmograph finished uploading the data (its onGraphRebuilt callback). */
function rebuild() {
  act(() => {
    (lastProps().onGraphRebuilt as () => void)();
  });
}

function showFrame(f: MergedFrame) {
  act(() => {
    useSimulationStore.getState().updateFrame(f);
  });
}

let cosmos: FakeCosmos;

beforeEach(() => {
  cosmograph.renders = [];
  cosmos = fakeCosmos(3);
  cosmograph.instance = { _cosmos: cosmos, selectPoint: vi.fn(), getZoomLevel: () => 1 };
  useSimulationStore.getState().reset();
  vi.spyOn(logger, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  resetDirectRepaint();
  useSimulationStore.getState().reset();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SimulationCanvas per-round repaint (#142)", () => {
  it("pushes each new frame's buffers to cosmos.gl and keeps the Cosmograph props static", async () => {
    await mountCanvas();
    rebuild();
    const rendersBefore = cosmograph.renders.length;

    const f1 = frame(1, [0.1, 0.9, 0.4], [0.2, 0.8, 0.4], [1, 0, 1]);
    showFrame(f1);
    expect(cosmos.graph.pointColors).toEqual(expected(f1, "pub"));
    // points are agents 2, 0, 1 → speaking 1, 1, 0
    expect(Array.from(cosmos.graph.pointSizes)).toEqual([14, 14, 8]);

    const f2 = frame(2, [0.6, 0.3, 0.2], [0.6, 0.3, 0.2], [0, 0, 0]);
    showFrame(f2);
    expect(cosmos.graph.pointColors).toEqual(expected(f2, "pub"));
    expect(cosmos.create).toHaveBeenCalledTimes(3); // rebuild + 2 rounds

    // The rounds did not re-render <Cosmograph> (no per-round setConfig), and no callbacks
    // were handed to it.
    expect(cosmograph.renders.length).toBe(rendersBefore);
    expect(lastProps().pointColorByFn).toBeUndefined();
    expect(lastProps().pointSizeByFn).toBeUndefined();
    expect(lastProps().pointColorBy).toBe("initialBelief");
  });

  it("re-pushes when the colour mode changes", async () => {
    await mountCanvas();
    rebuild();
    const f = frame(1, [0.1, 0.9, 0.4], [0.3, 0.6, 0.4], [0, 0, 0]);
    showFrame(f);
    for (const mode of ["priv", "div", "estr"] as const) {
      act(() => {
        fireEvent.change(screen.getByLabelText("color-by"), { target: { value: mode } });
      });
      expect(cosmos.graph.pointColors).toEqual(expected(f, mode));
    }
    expect(cosmos.graph.pointColors).toEqual(TABLES.strategyColors);
  });

  it("re-pushes after Cosmograph replaced the colours on a config update", async () => {
    await mountCanvas();
    rebuild();
    const f = frame(1, [0.1, 0.9, 0.4], [0.3, 0.6, 0.4], [0, 0, 0]);
    showFrame(f);
    cosmos.setPointColors(new Float32Array(12));
    cosmos.graph.updatePointColor();
    act(() => {
      (lastProps().onConfigUpdated as () => void)();
    });
    expect(cosmos.graph.pointColors).toEqual(expected(f, "pub"));
  });

  it("falls back to Cosmograph callbacks when cosmos.gl is not reachable", async () => {
    cosmograph.instance = { _cosmos: { render: () => undefined }, selectPoint: vi.fn() };
    await mountCanvas();
    rebuild();
    expect(logger.error).toHaveBeenCalledOnce();

    const f = frame(1, [0.1, 0.9, 0.4], [0.3, 0.6, 0.4], [1, 0, 0]);
    showFrame(f);
    const props = lastProps();
    expect(props.pointColorBy).toBe("agentIndex");
    expect(props.pointColorStrategy).toBeUndefined();
    const colorFn = props.pointColorByFn as (value: unknown) => string;
    const sizeFn = props.pointSizeByFn as (value: unknown) => number;
    expect(colorFn(0)).toBe(interpolateOpinion(f.publicBelief[0] as number));
    expect(sizeFn(0)).toBe(14);
    expect(sizeFn(1)).toBe(8);
  });
});
