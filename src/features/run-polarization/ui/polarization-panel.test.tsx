import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import polarizationEn from "@/shared/i18n/locales/polarization.en";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { usePolarizationSettingsStore } from "../model/polarization-settings.store";
import { PolarizationPanelView as PolarizationPanel } from "./polarization-panel";
import { PolarizationWikiSection } from "./polarization-wiki-section";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("echarts-for-react", () => ({
  default: ({
    option,
  }: {
    option: { series: Array<{ data: unknown[]; markLine: { data: unknown[] } }> };
  }) => (
    <div
      data-testid="echart"
      data-points={option.series[0]?.data.length ?? 0}
      data-marks={option.series[0]?.markLine.data.length ?? 0}
    />
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const p = polarizationEn;

/** Two poles in private beliefs (BiPol = 1, ER ≈ 1), consensus in public. */
function frame(round: number): MergedFrame {
  return {
    runId: "run-1",
    networkId: "net-1",
    round,
    publicBelief: new Float32Array([0.5, 0.5, 0.5, 0.5]),
    privateBelief: new Float32Array([0, 0, 1, 1]),
    speaking: new Uint8Array(4),
  };
}

let frames: FrameRequestCallback[] = [];
const flushFrames = () =>
  act(() => {
    for (let i = 0; i < 3; i++) {
      const pending = frames;
      frames = [];
      for (const cb of pending) cb(0);
    }
  });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PolarizationPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    usePolarizationSettingsStore.setState({
      measureId: "BiPol",
      paramsByMeasure: {},
      k: 5,
      belief: "private",
    });
    useRoundAggregatesStore.getState().reset();
    useSimulationStore.getState().reset();
    useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(0));
    useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(1));
    useSimulationStore.getState().updateFrame(frame(1));
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the viewed round's value and its package level", () => {
    render(<PolarizationPanel />);
    flushFrames();
    expect(screen.getByText(p.valueAt.replace("{{round}}", "1"))).toBeInTheDocument();
    expect(screen.getByText("1.0000")).toBeInTheDocument();
    expect(screen.getByText(p.levels.high)).toBeInTheDocument();
    const chart = screen.getByTestId("echart");
    expect(chart).toHaveAttribute("data-points", "2");
    // playhead + two thresholds
    expect(chart).toHaveAttribute("data-marks", "3");
  });

  it("switches belief type and k (private by default, k = 5)", () => {
    render(<PolarizationPanel />);
    flushFrames();
    const privateButton = screen.getByRole("button", { name: p.beliefPrivate });
    expect(privateButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: p.beliefPublic }));
    flushFrames();
    expect(usePolarizationSettingsStore.getState().belief).toBe("public");
    // Public beliefs are a consensus: BiPol 0, level low
    expect(screen.getByText("0.0000")).toBeInTheDocument();
    expect(screen.getByText(p.levels.low)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(usePolarizationSettingsStore.getState().k).toBe(7);
  });

  it("explains that Experts needs 5 categories and offers to switch", () => {
    usePolarizationSettingsStore.setState({ measureId: "Experts", k: 3 });
    render(<PolarizationPanel />);
    flushFrames();
    expect(screen.getByText(p.unsupportedK.replace("{{name}}", "Experts"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: p.useFiveCategories }));
    expect(usePolarizationSettingsStore.getState().k).toBe(5);
  });

  it("edits parameters, ignores out-of-range input and restores the defaults", () => {
    usePolarizationSettingsStore.setState({ measureId: "EstebanRay" });
    render(<PolarizationPanel />);
    flushFrames();
    const alpha = screen.getByRole("textbox", { name: p.paramAria.replace("{{name}}", "α") });
    expect(alpha).toHaveValue("0.8");
    fireEvent.change(alpha, { target: { value: "2" } });
    expect(alpha).toHaveAttribute("aria-invalid", "true");
    expect(usePolarizationSettingsStore.getState().paramsByMeasure.EstebanRay).toBeUndefined();
    fireEvent.change(alpha, { target: { value: "1,2" } });
    expect(usePolarizationSettingsStore.getState().paramsByMeasure.EstebanRay).toEqual({
      alpha: 1.2,
    });
    // α ≠ 0.8: the package has no thresholds → no level badge
    flushFrames();
    expect(screen.queryByText(p.levels.high)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: p.resetParamsAria }));
    expect(usePolarizationSettingsStore.getState().paramsByMeasure.EstebanRay).toBeUndefined();
    expect(alpha).toHaveValue("0.8");
  });

  it("is loaded on demand by the feature's PolarizationPanel", async () => {
    const { PolarizationPanel: LazyPanel } = await import("./lazy-polarization-panel");
    render(<LazyPanel />);
    expect(await screen.findByRole("group", { name: p.kAria })).toBeInTheDocument();
  });

  it("labels MEC normalized as BETA", () => {
    usePolarizationSettingsStore.setState({ measureId: "MECNormalized" });
    render(<PolarizationPanel />);
    expect(screen.getAllByText(p.beta).length).toBeGreaterThan(0);
  });
});

describe("PolarizationWikiSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("documents every measure with its formula, parameters and reference", () => {
    const { container } = render(<PolarizationWikiSection />);
    expect(screen.getByRole("heading", { level: 2, name: p.wiki.title })).toBeInTheDocument();
    for (const name of [
      "Esteban–Ray",
      "Generalized ER",
      "EMD-pol",
      "Experts",
      "Shannon-pol",
      "Van der Eijk-pol",
      "MEC",
      "MEC normalized",
      "Generalized MEC",
      "BiPol",
    ]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll("[data-slot='card']").length).toBeGreaterThanOrEqual(10);
    expect(screen.getByText(p.wiki.meaning.MEC)).toBeInTheDocument();
    expect(container.innerHTML).toContain("\\mathrm{MEC}_{\\alpha,\\beta}");
  });

  it("credits pol_measures, its authors and the commit, with accessible external links", () => {
    render(<PolarizationWikiSection />);
    const link = screen.getByRole("link", { name: new RegExp(p.wiki.sourceLink) });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/ulvenforst/pol_measures/tree/0e05564ed0b7b23de368dd19becac3a1de4ef745",
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent(en.common.opensInNewTab);
    expect(screen.getByText(/Juan Camilo Narváez Tascón/)).toBeInTheDocument();
    // BiPol's card and the source paragraph both credit him
    expect(screen.getAllByText(/Carlos Pinzón/, { selector: "p" })).toHaveLength(2);
    // The MEC paper is cited by the three MEC measures
    expect(screen.getAllByRole("link", { name: /arXiv:2606\.13997/ })).toHaveLength(3);
  });
});
