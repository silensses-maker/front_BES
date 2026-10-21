import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// The server: pol_measures behind GET /simulations/polarization/measures and POST …/polarization.
vi.mock("@/shared/api/backend", () => ({
  simulationsApi: { computePolarization: vi.fn(), getPolarizationMeasures: vi.fn() },
}));

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
import { usePolarizationSettingsStore } from "../model/polarization-settings.store";
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

  it("loads the catalog, then shows the server's value and level for the viewed round", async () => {
    render(<PolarizationPanel />);
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
    usePolarizationSettingsStore.setState({ measureId: "MECNormalized" });
    render(<PolarizationPanel />);
    await flush();
    expect(screen.getAllByText(p.beta).length).toBeGreaterThan(0);
  });

  it("switches belief type and k (private by default, k = 5)", async () => {
    render(<PolarizationPanel />);
    await flush();
    expect(screen.getByRole("button", { name: p.beliefPrivate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: p.beliefPublic }));
    await flush();
    expect(usePolarizationSettingsStore.getState().belief).toBe("public");
    await waitFor(() => expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(2));
    await flush();
    // Public beliefs are a consensus: nobody at the extremes, level low
    expect(screen.getByText("0.0000")).toBeInTheDocument();
    expect(screen.getByText(p.levels.low)).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(usePolarizationSettingsStore.getState().k).toBe(7);
  });

  it("Experts is only offered for k = 5 (from the catalog) and the view offers to switch", async () => {
    usePolarizationSettingsStore.setState({ measureId: "Experts", k: 3 });
    render(<PolarizationPanel />);
    await flush();
    expect(
      screen.getByText(p.unsupportedK.replace("{{name}}", "Experts").replace("{{k}}", "3")),
    ).toBeInTheDocument();
    expect(simulationsApi.computePolarization).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: p.useCategories.replace("{{k}}", "5") }));
    expect(usePolarizationSettingsStore.getState().k).toBe(5);
    await flush();
    expect(simulationsApi.computePolarization).toHaveBeenCalledWith(
      expect.objectContaining({ measure: "Experts", k: 5 }),
    );
  });

  it("edits parameters within the catalog's range, debounced, and restores the defaults", async () => {
    usePolarizationSettingsStore.setState({ measureId: "EstebanRay" });
    render(<PolarizationPanel />);
    await flush();
    expect(screen.getByText(p.levels.high)).toBeInTheDocument();
    const alpha = screen.getByRole("textbox", { name: p.paramAria.replace("{{name}}", "α") });
    expect(alpha).toHaveValue("0.8");
    expect(screen.getByRole("textbox", { name: p.paramAria.replace("{{name}}", "K") })).toHaveValue(
      "",
    );
    fireEvent.change(alpha, { target: { value: "2" } });
    expect(alpha).toHaveAttribute("aria-invalid", "true");
    expect(usePolarizationSettingsStore.getState().paramsByMeasure.EstebanRay).toBeUndefined();
    fireEvent.change(alpha, { target: { value: "1,2" } });
    expect(usePolarizationSettingsStore.getState().paramsByMeasure.EstebanRay).toEqual({
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
    expect(usePolarizationSettingsStore.getState().paramsByMeasure.EstebanRay).toBeUndefined();
    expect(alpha).toHaveValue("0.8");
  });

  it("offers the f(d) whitelist of the catalog for the generalized measures", async () => {
    usePolarizationSettingsStore.setState({ measureId: "GeneralizedMEC" });
    render(<PolarizationPanel />);
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
    render(<PolarizationPanel />);
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
    render(<PolarizationPanel />);
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
    render(<PolarizationPanel />);
    await flush();
    expect(screen.getByText(p.invalidParams.replace("{{name}}", "BiPol"))).toBeInTheDocument();
    expect(screen.getByText("BiPol is not defined for k = 5 categories")).toBeInTheDocument();
  });

  it("is loaded on demand by the feature's PolarizationPanel", async () => {
    const { PolarizationPanel: LazyPanel } = await import("./lazy-polarization-panel");
    render(<LazyPanel />);
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
