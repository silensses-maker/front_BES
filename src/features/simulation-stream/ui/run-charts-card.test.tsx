import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { RunChartsCard } from "./run-charts-card";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

interface MockOption {
  series: Array<{ name?: string; data?: unknown[]; lineStyle?: { color?: string; type?: string } }>;
}

/** ECharts is canvas-only: render the series the card hands it. */
vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: MockOption }) => (
    <div
      data-testid="echart"
      data-series={JSON.stringify(
        option.series.map((s) => ({
          name: s.name ?? null,
          points: s.data?.length ?? 0,
          line: s.lineStyle ?? null,
        })),
      )}
    />
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function frame(round: number): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array([0.1, 0.9, 0.5]),
    privateBelief: new Float32Array([0.2, 0.8, 0.5]),
    speaking: new Uint8Array([1, 0, 1]),
  };
}

function series(): Array<{
  name: string | null;
  points: number;
  line: { color?: string; type?: string } | null;
}> {
  return JSON.parse(screen.getByTestId("echart").getAttribute("data-series") ?? "[]");
}

let frames: FrameRequestCallback[] = [];
const flushFrames = () =>
  act(() => {
    const pending = frames;
    frames = [];
    for (const cb of pending) cb(0);
  });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("RunChartsCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    useRoundAggregatesStore.getState().reset();
    useSimulationStore.getState().reset();
    for (let round = 0; round < 3; round++) {
      useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(round));
    }
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the built-in tabs, the Variance tab and any extra tab", () => {
    render(
      <RunChartsCard
        maximized={false}
        onToggleMaximize={() => {}}
        extraTabs={[{ key: "extra", label: "Extra view", content: <p>extra content</p> }]}
      />,
    );
    for (const label of [
      en.runView.tabEvolution,
      en.runView.tabDistribution,
      en.runView.tabPublicPrivate,
      en.runView.tabParticipation,
      en.runView.tabVariance,
      "Extra view",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: en.runView.tabEvolution })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Extra view" }));
    expect(screen.getByText("extra content")).toBeInTheDocument();
    expect(screen.queryByTestId("echart")).toBeNull();
  });

  it("plots σ or σ² of public (solid) and private (dashed) beliefs per round", () => {
    render(<RunChartsCard maximized={false} onToggleMaximize={() => {}} />);
    flushFrames();
    fireEvent.click(screen.getByRole("button", { name: en.runView.tabVariance }));

    const std = screen.getByRole("button", { name: en.runView.dispersionStd });
    const variance = screen.getByRole("button", { name: en.runView.dispersionVariance });
    expect(std).toHaveAttribute("aria-pressed", "true");
    const [pub, priv] = series();
    expect(pub).toMatchObject({ name: en.runView.seriesPublic, points: 3 });
    expect(priv?.line?.type).toBe("dashed");

    fireEvent.click(variance);
    expect(variance).toHaveAttribute("aria-pressed", "true");
    expect(series()[0]?.points).toBe(3);
  });

  it("coalesces live rounds into one chart update per animation frame", () => {
    render(<RunChartsCard maximized={false} onToggleMaximize={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: en.runView.tabParticipation }));
    flushFrames();
    expect(series()[0]?.points).toBe(3);

    act(() => {
      for (let round = 3; round < 8; round++) {
        useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(round));
      }
    });
    // Not repainted until the next frame
    expect(series()[0]?.points).toBe(3);
    flushFrames();
    expect(series()[0]?.points).toBe(8);
  });

  it("renders the public mean, distribution and evolution views", () => {
    render(<RunChartsCard maximized={true} onToggleMaximize={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: en.runView.tabPublicPrivate }));
    expect(series().map((s) => s.name)).toEqual([
      en.runView.seriesPublic,
      en.runView.seriesPrivate,
    ]);
    fireEvent.click(screen.getByRole("button", { name: en.runView.tabDistribution }));
    expect(series()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: en.runView.tabEvolution }));
    expect(series().length).toBeGreaterThanOrEqual(1);
  });
});
