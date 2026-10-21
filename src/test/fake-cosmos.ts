import { vi } from "vitest";

/**
 * A stand-in for cosmos.gl 3.0.0-beta.8's Graph: the input arrays become the drawn arrays when
 * their length matches the point count (graph.updatePointColor / updatePointSize, or render()).
 */
export function fakeCosmos(points: number) {
  const graph = {
    pointsNumber: points,
    inputPointColors: undefined as Float32Array | undefined,
    inputPointSizes: undefined as Float32Array | undefined,
    pointColors: new Float32Array(points * 4) as Float32Array,
    pointSizes: new Float32Array(points) as Float32Array,
    updatePointColor: vi.fn(() => {
      const input = graph.inputPointColors;
      graph.pointColors =
        input && input.length === points * 4 ? input : new Float32Array(points * 4);
    }),
    updatePointSize: vi.fn(() => {
      const input = graph.inputPointSizes;
      graph.pointSizes = input && input.length === points ? input : new Float32Array(points);
    }),
  };
  const cosmos = {
    graph,
    isSimulationRunning: false,
    setPointColors: vi.fn((c: Float32Array) => {
      graph.inputPointColors = c;
    }),
    setPointSizes: vi.fn((s: Float32Array) => {
      graph.inputPointSizes = s;
    }),
    getPointColors: vi.fn(() => graph.pointColors),
    getPointSizes: vi.fn(() => graph.pointSizes),
    create: vi.fn(),
    render: vi.fn((_alpha?: number) => {
      graph.updatePointColor();
      graph.updatePointSize();
    }),
  };
  return cosmos;
}

export type FakeCosmos = ReturnType<typeof fakeCosmos>;
