import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// The server: pol_measures behind GET /simulations/polarization/measures and POST …/polarization.
vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { computePolarization: vi.fn(), getPolarizationMeasures: vi.fn() },
}));

// The overlay's notice (with its undo) and the export's
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

interface MockSeries {
  name?: string;
  type: string;
  data: unknown[];
  lineStyle?: { color: string; type: unknown };
  markLine?: { data: unknown[] };
}
interface MockOption {
  series: MockSeries[];
  legend?: { data: string[] };
  yAxis: { max?: number };
  tooltip: { formatter: (params: unknown) => string };
}

/**
 * The chart, as data attributes: lines (colours, dash patterns), markers, marks (playhead +
 * thresholds), legend, y max, tooltip.
 */
vi.mock("echarts-for-react", () => ({
  default: ({ option }: { option: MockOption }) => {
    const lines = option.series.filter((series) => series.name !== undefined);
    const marks = option.series.reduce((n, series) => n + (series.markLine?.data.length ?? 0), 0);
    // The tooltip at the playhead, for every line
    const tooltip = option.tooltip.formatter(lines.map((_, seriesIndex) => ({ seriesIndex })));
    return (
      <div
        data-testid="echart"
        data-points={option.series[0]?.data.length ?? 0}
        data-marks={marks}
        data-lines={lines.length}
        data-colors={lines.map((line) => line.lineStyle?.color).join("|")}
        data-dashes={lines.map((line) => JSON.stringify(line.lineStyle?.type)).join("|")}
        data-markers={option.series.filter((series) => series.type === "scatter").length}
        data-legend={option.legend?.data.join("|") ?? ""}
        data-ymax={String(option.yAxis.max ?? "")}
        data-tooltip={tooltip}
      />
    );
  },
}));

import { toast } from "sonner";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import {
  type PolarizationCatalog,
  type PolarizationRequest,
  type PolarizationResult,
  simulationsApi,
} from "@/shared/api/backend";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import polarizationEn from "@/shared/i18n/locales/polarization.en";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { usePolarizationCatalogStore } from "../model/polarization-catalog.store";
import {
  defaultSettings,
  usePolarizationSettingsStore,
} from "../model/polarization-settings.store";
import { fromSingleSeries, MAX_SERIES, type SeriesConfig } from "../model/series-list";
import { PolarizationPanelView as PolarizationPanel } from "./polarization-panel";
import { PolarizationWikiSection } from "./polarization-wiki-section";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const p = polarizationEn;

/** The catalog the real worker answered (pol_measures @ 0e05564), as the backend serves it. */
const catalog: PolarizationCatalog = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "__fixtures__", "pol-measures-catalog.json"),
    "utf8",
  ),
);

const httpError = (status: number, error: string, message: string) => ({
  isAxiosError: true,
  response: { status, data: { error, message } },
});

/**
 * A stand-in for the server (the real values come from pol_measures, see the backend's self-test):
 * value = share of the agents in the two extreme categories, levels from the catalog's thresholds
 * of the measure when its parameters are the defaults.
 */
function fakeServer(body: PolarizationRequest): Promise<PolarizationResult> {
  const info = catalog.measures.find((m) => m.id === body.measure);
  const defaults = Object.fromEntries((info?.params ?? []).map((s) => [s.name, s.default]));
  const isDefault = Object.entries(body.params ?? {}).every(([name, v]) => defaults[name] === v);
  const classification = isDefault ? (info?.classification ?? null) : null;
  const values = body.histograms.map((h) => {
    const total = h.reduce((a, b) => a + b, 0);
    return ((h[0] as number) + (h[h.length - 1] as number)) / total;
  });
  return Promise.resolve({
    values,
    levels: values.map((v) => {
      if (classification === null) return null;
      const i = classification.thresholds.findIndex((t) => v < t);
      return classification.levels[i === -1 ? classification.levels.length - 1 : i] ?? null;
    }),
    classification,
    unique: new Set(body.histograms.map(String)).size,
    package: { ref: catalog.package.commit, version: catalog.package.version },
  });
}

/** Two poles in private beliefs, consensus in public. */
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
/** Runs the pending animation frames and lets the (mocked) requests resolve, a few times. */
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      const pending = frames;
      frames = [];
      for (const cb of pending) cb(0);
      await Promise.resolve();
    });
  }
};

/** The run / network the panel belongs to (the page passes them). */
const IDS = { runId: "run-1", networkId: "net-1" };

/** One series (the single-series settings, migrated to the list), real values, the chart. */
function settings(measureId: string, k: 3 | 5 | 7 | 10 = 5) {
  usePolarizationSettingsStore.setState({
    ...defaultSettings(),
    ...fromSingleSeries({ measureId, paramsByMeasure: {}, k, belief: "private" }),
  });
}

const seriesAt = (index: number) =>
  usePolarizationSettingsStore.getState().series[index] as SeriesConfig;
const first = () => seriesAt(0);

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    template,
  );

const ADD = fill(p.addSeriesAria, { max: MAX_SERIES });
const chip = (label: string) => fill(p.seriesAria, { label });
const chips = () => within(screen.getByRole("group", { name: p.seriesGroupAria }));

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
    vi.mocked(simulationsApi.getPolarizationMeasures).mockReset().mockResolvedValue(catalog);
    vi.mocked(simulationsApi.computePolarization).mockReset().mockImplementation(fakeServer);
    usePolarizationCatalogStore.setState({ status: "idle", catalog: null, error: null });
    settings("BiPol");
    useRoundAggregatesStore.getState().reset();
    useSimulationStore.getState().reset();
    useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(0));
    useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(1));
    useSimulationStore.getState().updateFrame(frame(1));
  });
  afterEach(() => vi.restoreAllMocks());

  it("loads the catalog, then shows the server's value and level for the viewed round", async () => {
    render(<PolarizationPanel {...IDS} />);
    expect(screen.getByText(p.catalogLoading)).toBeInTheDocument();
    await flush();
    expect(simulationsApi.getPolarizationMeasures).toHaveBeenCalledTimes(1);
    expect(simulationsApi.computePolarization).toHaveBeenCalledWith({
      measure: "BiPol",
      params: {},
      k: 5,
      histograms: [
        [2, 0, 0, 0, 2],
        [2, 0, 0, 0, 2],
      ],
    });
    expect(screen.getByText(p.valueAt.replace("{{round}}", "1"))).toBeInTheDocument();
    expect(screen.getByText("1.0000")).toBeInTheDocument();
    expect(screen.getByText(p.levels.high)).toBeInTheDocument();
    const chart = screen.getByTestId("echart");
    expect(chart).toHaveAttribute("data-points", "2");
    // playhead + the two thresholds the server sent
    expect(chart).toHaveAttribute("data-marks", "3");
    expect(screen.getByText(p.aboutWithLevels, { exact: false })).toBeInTheDocument();
  });

  it("groups the catalog's measures (literature / proposed) and labels MEC normalized as BETA", async () => {
    settings("MECNormalized");
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getAllByText(p.beta).length).toBeGreaterThan(0);
  });

  it("switches belief type and k (private by default, k = 5)", async () => {
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByRole("button", { name: p.beliefPrivate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: p.beliefPublic }));
    await flush();
    expect(first().belief).toBe("public");
    await waitFor(() => expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(2));
    await flush();
    // Public beliefs are a consensus: nobody at the extremes, level low
    expect(screen.getByText("0.0000")).toBeInTheDocument();
    expect(screen.getByText(p.levels.low)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(first().k).toBe(7);
  });

  it("Experts is only offered for k = 5 (from the catalog) and the view offers to switch", async () => {
    settings("Experts", 3);
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(
      screen.getByText(p.unsupportedK.replace("{{name}}", "Experts").replace("{{k}}", "3")),
    ).toBeInTheDocument();
    expect(simulationsApi.computePolarization).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: p.useCategories.replace("{{k}}", "5") }));
    expect(first().k).toBe(5);
    await flush();
    expect(simulationsApi.computePolarization).toHaveBeenCalledWith(
      expect.objectContaining({ measure: "Experts", k: 5 }),
    );
  });

  it("edits parameters within the catalog's range, debounced, and restores the defaults", async () => {
    settings("EstebanRay");
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByText(p.levels.high)).toBeInTheDocument();
    const alpha = screen.getByRole("textbox", { name: p.paramAria.replace("{{name}}", "α") });
    expect(alpha).toHaveValue("0.8");
    expect(screen.getByRole("textbox", { name: p.paramAria.replace("{{name}}", "K") })).toHaveValue(
      "",
    );
    fireEvent.change(alpha, { target: { value: "2" } });
    expect(alpha).toHaveAttribute("aria-invalid", "true");
    expect(first().paramsByMeasure.EstebanRay).toBeUndefined();
    fireEvent.change(alpha, { target: { value: "1,2" } });
    expect(first().paramsByMeasure.EstebanRay).toEqual({
      alpha: 1.2,
    });
    await waitFor(() => expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(2));
    expect(vi.mocked(simulationsApi.computePolarization).mock.calls[1]?.[0].params).toEqual({
      alpha: 1.2,
      K: null,
    });
    await flush();
    // α ≠ 0.8: the package has no thresholds for it → no level badge
    expect(screen.queryByText(p.levels.high)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: p.resetParamsAria }));
    expect(first().paramsByMeasure.EstebanRay).toBeUndefined();
    expect(alpha).toHaveValue("0.8");
  });

  it("offers the f(d) whitelist of the catalog for the generalized measures", async () => {
    settings("GeneralizedMEC");
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByRole("combobox", { name: p.alienationAria })).toHaveTextContent("d");
    expect(simulationsApi.computePolarization).toHaveBeenCalledWith(
      expect.objectContaining({ measure: "GeneralizedMEC", params: { alpha: 2, alienation: "d" } }),
    );
  });

  it("a server without polarization (404) gets a clear message and no retry", async () => {
    vi.mocked(simulationsApi.getPolarizationMeasures).mockRejectedValue(
      httpError(404, "not_found", "Polarization measures are disabled on this server"),
    );
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByText(p.errorDisabled)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: p.retry })).toBeNull();
    expect(simulationsApi.computePolarization).not.toHaveBeenCalled();
  });

  it("an unavailable worker (503) can be retried, for the catalog and for the values", async () => {
    vi.mocked(simulationsApi.getPolarizationMeasures).mockRejectedValueOnce(
      httpError(503, "unavailable", "The polarization worker could not be started"),
    );
    vi.mocked(simulationsApi.computePolarization).mockRejectedValueOnce(
      httpError(503, "unavailable", "The polarization worker did not answer within 30 s"),
    );
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByText(p.errorUnavailable)).toBeInTheDocument();
    expect(screen.getByText("The polarization worker could not be started")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: p.retry }));
    await flush();
    expect(
      screen.getByText("The polarization worker did not answer within 30 s"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: p.retry }));
    await flush();
    expect(screen.getByText("1.0000")).toBeInTheDocument();
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(2);
  });

  it("parameters the server rejects (422) show its message", async () => {
    vi.mocked(simulationsApi.computePolarization).mockRejectedValue(
      httpError(422, "invalid_measure", "BiPol is not defined for k = 5 categories"),
    );
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByText(p.invalidParams.replace("{{name}}", "BiPol"))).toBeInTheDocument();
    expect(screen.getByText("BiPol is not defined for k = 5 categories")).toBeInTheDocument();
  });

  // ── Comparison ────────────────────────────────────────────────────────────

  it("+ adds a copy of the selected series (cached: no request), up to 10; × removes, never the last", async () => {
    render(<PolarizationPanel {...IDS} />);
    await flush();
    // One series: the view as before (no chips, no axis toggle)
    expect(screen.queryByRole("group", { name: p.seriesGroupAria })).toBeNull();
    expect(screen.queryByRole("group", { name: p.axisAria })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: ADD }));
    await flush();
    const label = "BiPol · k=5 · private";
    expect(chips().getByRole("button", { name: chip(label) })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(chips().getByRole("button", { name: chip(`${label} (2)`) })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(1);
    const chart = screen.getByTestId("echart");
    expect(chart).toHaveAttribute("data-lines", "2");
    expect(chart).toHaveAttribute("data-legend", `${label}|${label} (2)`);
    // Distinct colours per series
    expect(new Set(chart.getAttribute("data-colors")?.split("|")).size).toBe(2);

    for (let i = 2; i < MAX_SERIES; i++)
      fireEvent.click(chips().getByRole("button", { name: ADD }));
    await flush();
    expect(usePolarizationSettingsStore.getState().series).toHaveLength(10);
    expect(chips().getByRole("button", { name: ADD })).toBeDisabled();
    expect(screen.getByText(fill(p.addSeriesLimit, { max: 10 }))).toBeInTheDocument();
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(1);

    for (let n = MAX_SERIES; n >= 2; n--) {
      fireEvent.click(
        chips().getByRole("button", {
          name: fill(p.removeSeriesAria, { label: `${label} (${n})` }),
        }),
      );
    }
    await flush();
    // Back to one series: no chips, no × to remove it
    expect(screen.queryByRole("group", { name: p.seriesGroupAria })).toBeNull();
    expect(screen.queryByRole("button", { name: fill(p.removeSeriesAria, { label }) })).toBeNull();
    expect(screen.getByTestId("echart")).toHaveAttribute("data-marks", "3");
  });

  it("configures each series on its own; a chip shows (and hides) its settings", async () => {
    render(<PolarizationPanel {...IDS} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    await flush();
    // The copy is selected: its settings are shown; make it read the public beliefs
    expect(
      screen.getByRole("group", {
        name: fill(p.configAria, { label: "BiPol · k=5 · private (2)" }),
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: p.beliefPublic }));
    expect([first().belief, seriesAt(1).belief]).toEqual(["private", "public"]);
    await waitFor(() => expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(2));
    await flush();
    // The viewed round: 1 for the private poles, 0 for the public consensus
    const values = within(
      screen.getByRole("list", { name: fill(p.valuesAria, { round: 1 }) }),
    ).getAllByRole("listitem");
    expect(values.map((item) => item.textContent)).toEqual([
      "BiPol · k=5 · private: 1.0000",
      "BiPol · k=5 · public: 0.0000",
    ]);

    // Select the first series: its own settings (private)
    fireEvent.click(chips().getByRole("button", { name: chip("BiPol · k=5 · private") }));
    expect(screen.getByRole("button", { name: p.beliefPrivate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect([first().k, seriesAt(1).k]).toEqual([7, 5]);

    // Clicking the selected chip again hides the settings, and shows them back
    const selected = chips().getByRole("button", { name: chip("BiPol · k=7 · private") });
    expect(selected).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(selected);
    expect(selected).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: p.kAria })).toBeNull();
    fireEvent.click(selected);
    expect(screen.getByRole("group", { name: p.kAria })).toBeInTheDocument();
  });

  it("applies the Experts k = 5 constraint per series, with its own Use k = 5", async () => {
    settings("BiPol", 3);
    usePolarizationSettingsStore.getState().addSeries();
    const copy = seriesAt(1).id;
    usePolarizationSettingsStore.getState().setMeasure(copy, "Experts");
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByText(fill(p.unsupportedK, { name: "Experts", k: 3 }))).toBeInTheDocument();
    expect(
      chips().getByRole("button", {
        name: `${chip("Experts · k=3 · private")}, ${p.seriesProblem}`,
      }),
    ).toBeInTheDocument();
    // The supported series is computed and drawn meanwhile
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("echart")).toHaveAttribute("data-lines", "1");

    fireEvent.click(screen.getByRole("button", { name: fill(p.useCategories, { k: 5 }) }));
    expect([first().k, seriesAt(1).k]).toEqual([3, 5]);
    await flush();
    expect(simulationsApi.computePolarization).toHaveBeenLastCalledWith(
      expect.objectContaining({ measure: "Experts", k: 5 }),
    );
    expect(screen.getByTestId("echart")).toHaveAttribute("data-lines", "2");
  });

  it("the y-axis toggle normalizes each series to its own min–max; the tooltip shows both values", async () => {
    // Round 2: half of the agents at the extremes (BiPol stand-in value 0.5)
    useRoundAggregatesStore.getState().ingest("run-1|net-1", {
      ...frame(2),
      privateBelief: new Float32Array([0, 0.5, 0.5, 1]),
    });
    render(<PolarizationPanel {...IDS} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    await flush();
    const toggle = within(screen.getByRole("group", { name: p.axisAria }));
    expect(toggle.getByRole("button", { name: p.axisValues })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const chart = () => screen.getByTestId("echart");
    expect(chart()).toHaveAttribute("data-ymax", "");
    expect(chart().getAttribute("data-tooltip")).toContain("BiPol · k=5 · private: <b>1.0000</b>");

    fireEvent.click(toggle.getByRole("button", { name: p.axisNormalized }));
    expect(usePolarizationSettingsStore.getState().axisMode).toBe("normalized");
    expect(chart()).toHaveAttribute("data-ymax", "1");
    const tooltip = chart().getAttribute("data-tooltip") ?? "";
    expect(tooltip).toContain(`${fill(p.tooltipRound, { round: 1 })} · ${p.axisNormalized}`);
    // Values 1, 1, 0.5 → round 1 is at the top of its range, and keeps its real value and level
    expect(tooltip).toContain(
      `BiPol · k=5 · private: <b>1.00</b> · ${fill(p.tooltipValue, { value: "1.0000" })} · ${p.levels.high}`,
    );
    // No thresholds while comparing (only the playhead)
    expect(chart()).toHaveAttribute("data-marks", "1");
  });

  it("thresholds and the level badge only with one series; several get a legend and per-series values", async () => {
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(screen.getByTestId("echart")).toHaveAttribute("data-marks", "3");
    expect(screen.getByText(p.levels.high)).toBeInTheDocument();
    expect(screen.getByTestId("echart")).toHaveAttribute("data-legend", "");

    fireEvent.click(screen.getByRole("button", { name: ADD }));
    await flush();
    expect(screen.getByTestId("echart")).toHaveAttribute("data-marks", "1");
    expect(screen.queryByText(p.levels.high)).toBeNull();
    expect(screen.getByText(p.aboutCompare)).toBeInTheDocument();
    expect(screen.getByTestId("echart").getAttribute("data-legend")).not.toBe("");
    // The tooltip still lists each series with its level
    expect(screen.getByTestId("echart").getAttribute("data-tooltip")).toContain(
      `BiPol · k=5 · private (2): <b>1.0000</b> · ${p.levels.high}`,
    );
  });

  it("a failing series shows its own error and retry; the others keep their values", async () => {
    const failing = (body: PolarizationRequest) =>
      body.measure === "MEC"
        ? Promise.reject(httpError(503, "unavailable", "The polarization worker is busy"))
        : fakeServer(body);
    vi.mocked(simulationsApi.computePolarization).mockImplementation(failing);
    usePolarizationSettingsStore.getState().addSeries();
    usePolarizationSettingsStore.getState().setMeasure(seriesAt(1).id, "MEC");
    render(<PolarizationPanel {...IDS} />);
    await flush();

    expect(screen.getByText(p.errorUnavailable)).toBeInTheDocument();
    expect(screen.getByText("(The polarization worker is busy)")).toBeInTheDocument();
    expect(
      chips().getByRole("button", { name: `${chip("MEC · k=5 · private")}, ${p.seriesProblem}` }),
    ).toBeInTheDocument();
    const values = within(screen.getByRole("list", { name: fill(p.valuesAria, { round: 1 }) }));
    expect(values.getByText("1.0000")).toBeInTheDocument();
    expect(values.getByText("—")).toBeInTheDocument();
    expect(screen.getByTestId("echart")).toHaveAttribute("data-lines", "2");

    vi.mocked(simulationsApi.computePolarization).mockImplementation(fakeServer);
    fireEvent.click(screen.getByRole("button", { name: p.retry }));
    await flush();
    expect(screen.queryByText(p.errorUnavailable)).toBeNull();
    expect(values.queryByText("—")).toBeNull();
    expect(simulationsApi.computePolarization).toHaveBeenLastCalledWith(
      expect.objectContaining({ measure: "MEC" }),
    );
  });

  // ── Many series ─────────────────────────────────────────────────────────

  /** The line sample of every chip, as "dash:colour", by the chip's (full) label. */
  const chipStyles = () =>
    new Map(
      chips()
        .getAllByRole("button", { pressed: false })
        .concat(chips().getAllByRole("button", { pressed: true }))
        .map((button) => {
          const sample = button.querySelector("svg[data-dash]");
          const line = sample?.querySelector("line");
          return [
            button.getAttribute("aria-label") ?? "",
            `${sample?.getAttribute("data-dash")}:${line?.getAttribute("stroke")}`,
          ];
        }),
    );

  it("overlays every measure defined for the selected series' k, with a skipped notice and undo", async () => {
    settings("BiPol", 3);
    render(<PolarizationPanel {...IDS} />);
    await flush();
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(1);
    const before = usePolarizationSettingsStore.getState().series;

    fireEvent.click(screen.getByRole("button", { name: p.overlayAria }));
    await flush();
    const series = usePolarizationSettingsStore.getState().series;
    // Experts is only defined for k = 5: nine measures, in catalog order, with defaults
    expect(series.map((s) => s.measureId)).toEqual(
      catalog.measures.map((m) => m.id).filter((id) => id !== "Experts"),
    );
    expect(series.every((s) => s.k === 3 && s.belief === "private")).toBe(true);
    expect(chips().getAllByRole("button", { name: /^Series / })).toHaveLength(9);
    // BiPol with its defaults was already computed: one request per other measure
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(9);
    expect(screen.getByTestId("echart")).toHaveAttribute("data-lines", "9");
    // The settings fold away to leave the chart room; the selected series' measure stays selected
    expect(chips().getByRole("button", { name: chip("BiPol · k=3 · private") })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    expect(toast.success).toHaveBeenCalledTimes(1);
    const [message, options] = vi.mocked(toast.success).mock.calls[0] as [
      string,
      { description?: string; action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe(fill(p.overlayToast_other, { display: 9, k: 3, belief: "private" }));
    expect(options.description).toBe(fill(p.overlaySkipped_one, { k: 3, names: "Experts" }));
    expect(options.action.label).toBe(p.overlayUndo);

    act(() => options.action.onClick());
    await flush();
    expect(usePolarizationSettingsStore.getState().series).toBe(before);
    expect(screen.queryByRole("group", { name: p.seriesGroupAria })).toBeNull();
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(9);
  });

  it("10 series: compact chips that wrap, the shared k and belief once, no legend", async () => {
    render(<PolarizationPanel {...IDS} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: p.overlayAria }));
    await flush();
    const group = screen.getByRole("group", { name: p.seriesGroupAria });
    expect(group).toHaveClass("flex-wrap");
    const buttons = chips().getAllByRole("button", { name: /^Series / });
    expect(buttons).toHaveLength(10);
    for (const button of buttons) {
      expect(button.parentElement).toHaveAttribute("data-compact", "true");
    }
    // Short labels on screen; the accessible names keep the full ones
    expect(within(group).getByText("k=5 · private")).toBeInTheDocument();
    expect(buttons[0]).toHaveTextContent(/^Esteban–Ray$/);
    expect(buttons[0]).toHaveAccessibleName(chip("Esteban–Ray · k=5 · private"));
    expect(toast.success).toHaveBeenCalledWith(
      fill(p.overlayToast_other, { display: 10, k: 5, belief: "private" }),
      expect.objectContaining({ description: undefined }),
    );
    const chart = screen.getByTestId("echart");
    expect(chart).toHaveAttribute("data-lines", "10");
    expect(chart).toHaveAttribute("data-legend", "");
    expect(chart).toHaveAttribute("data-markers", "6");
    expect(chart.getAttribute("data-dashes")?.split("|")).toEqual([
      ...Array(4).fill('"solid"'),
      ...Array(4).fill("[6,3]"),
      "[0.5,4]",
      "[0.5,4]",
    ]);
    // The tooltip identifies each series by its line sample too
    expect(chart.getAttribute("data-tooltip")).toContain('stroke-dasharray="0.5 4"');
    // + is disabled at the cap
    expect(chips().getByRole("button", { name: ADD })).toBeDisabled();
  });

  it("removing a series keeps the other series' colours and line styles", async () => {
    render(<PolarizationPanel {...IDS} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: p.overlayAria }));
    await flush();
    const before = chipStyles();
    expect(new Set(before.values()).size).toBe(10);
    const removed = chip("EMD-pol · k=5 · private");
    fireEvent.click(
      chips().getByRole("button", {
        name: fill(p.removeSeriesAria, { label: "EMD-pol · k=5 · private" }),
      }),
    );
    await flush();
    const after = chipStyles();
    expect(after.size).toBe(9);
    for (const [name, style] of after) expect(style).toBe(before.get(name));
    expect(after.has(removed)).toBe(false);
  });

  it("line samples are decorative (aria-hidden): chips, values, settings and table headers", async () => {
    render(<PolarizationPanel {...IDS} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: ADD }));
    await flush();
    const samples = () => Array.from(document.querySelectorAll("svg[data-dash]"));
    // 2 chips + 2 round values + the selected series' settings
    expect(samples()).toHaveLength(5);
    for (const sample of samples()) {
      expect(sample).toHaveAttribute("aria-hidden", "true");
      expect(sample).toHaveAttribute("focusable", "false");
    }
    // The values list still names each series
    const values = within(screen.getByRole("list", { name: fill(p.valuesAria, { round: 1 }) }));
    expect(values.getByText("BiPol · k=5 · private:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: p.viewTable }));
    await flush();
    const headers = screen.getAllByRole("columnheader");
    const sampled = headers.filter((header) => header.querySelector("svg[data-dash]") !== null);
    expect(sampled.map((header) => header.textContent)).toEqual([
      "BiPol · k=5 · private",
      "BiPol · k=5 · private (2)",
    ]);
    for (const header of sampled) {
      expect(header.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("is loaded on demand by the feature's PolarizationPanel", async () => {
    const { PolarizationPanel: LazyPanel } = await import("./lazy-polarization-panel");
    render(<LazyPanel {...IDS} />);
    expect(await screen.findByRole("group", { name: p.kAria })).toBeInTheDocument();
  });
});

describe("PolarizationWikiSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("documents every measure with its formula, parameters and reference", () => {
    const { container } = render(<PolarizationWikiSection />);
    expect(screen.getByRole("heading", { level: 2, name: p.wiki.title })).toBeInTheDocument();
    for (const measure of catalog.measures) {
      // the wiki documents exactly what the server's package exports
      expect(screen.getAllByText(measure.name).length).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll("[data-slot='card']").length).toBeGreaterThanOrEqual(10);
    expect(screen.getByText(p.wiki.meaning.MEC)).toBeInTheDocument();
    expect(container.innerHTML).toContain("\\mathrm{MEC}_{\\alpha,\\beta}");
  });

  it("explains comparing measures and the normalized (shape) axis", () => {
    const { container } = render(<PolarizationWikiSection />);
    expect(
      screen.getByRole("heading", { level: 3, name: p.wiki.compareTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(p.wiki.compare1)).toBeInTheDocument();
    expect(screen.getByText(p.wiki.compare3, { exact: false })).toBeInTheDocument();
    expect(container.innerHTML).toContain("\\tilde{x}_t");
  });

  it("documents the package's level thresholds (the server's catalog has the same values)", () => {
    render(<PolarizationWikiSection />);
    for (const id of ["EstebanRay", "BiPol", "MECNormalized"]) {
      const thresholds =
        catalog.measures.find((m) => m.id === id)?.classification?.thresholds ?? [];
      expect(thresholds).toHaveLength(2);
      for (const threshold of thresholds) {
        expect(screen.getByText(String(threshold))).toBeInTheDocument();
      }
    }
  });

  it("credits pol_measures on the server (linked at the pinned commit), its authors and the MEC paper", () => {
    render(<PolarizationWikiSection />);
    const link = screen.getByRole("link", { name: new RegExp(p.wiki.sourceLink) });
    expect(link).toHaveAttribute(
      "href",
      `https://github.com/ulvenforst/pol_measures/tree/${catalog.package.commit}`,
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent(en.common.opensInNewTab);
    expect(
      screen.getByText(/computed on the server by PROMUEVA's pol_measures package/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Juan Camilo Narváez Tascón/)).toBeInTheDocument();
    // BiPol's card and the source paragraph both credit him
    expect(screen.getAllByText(/Carlos Pinzón/, { selector: "p" })).toHaveLength(2);
    // The MEC paper: cited by the three MEC measures, and named in the source paragraph
    expect(screen.getAllByRole("link", { name: /arXiv:2606\.13997/ })).toHaveLength(3);
    expect(screen.getByText(/MEC paper arXiv:2606\.13997/)).toBeInTheDocument();
  });
});
