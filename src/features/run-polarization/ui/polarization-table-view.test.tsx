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

vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));

// The download itself (an anchor click) is tested in shared/lib/csv.test.ts
vi.mock("@/shared/lib/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/csv")>()),
  downloadCsv: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { toast } from "sonner";
import { useRoundAggregatesStore, useSimulationStore } from "@/entities/simulation";
import {
  type PolarizationCatalog,
  type PolarizationRequest,
  type PolarizationResult,
  simulationsApi,
} from "@/shared/api/backend";
import { i18n } from "@/shared/i18n";
import polarizationEn from "@/shared/i18n/locales/polarization.en";
import { downloadCsv } from "@/shared/lib/csv";
import type { MergedFrame } from "@/shared/workers/simulation-frame-merger";
import { usePolarizationCatalogStore } from "../model/polarization-catalog.store";
import {
  defaultSettings,
  usePolarizationSettingsStore,
} from "../model/polarization-settings.store";
import { fromSingleSeries } from "../model/series-list";
import { PolarizationPanelView as PolarizationPanel } from "./polarization-panel";
import { HEADER_HEIGHT, ROW_HEIGHT } from "./polarization-table";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const p = polarizationEn;
const pt = polarizationEn.table;

const catalog: PolarizationCatalog = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "__fixtures__", "pol-measures-catalog.json"),
    "utf8",
  ),
);
const REF = catalog.package.commit;
const VERSION = catalog.package.version;

/** Stand-in for the server: value = share of the agents at the extremes, the catalog's levels. */
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
    package: { ref: REF, version: VERSION },
  });
}

/** Two poles in private beliefs (value 1), consensus in public (value 0). */
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
const flush = async (times = 4) => {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      const pending = frames;
      frames = [];
      for (const cb of pending) cb(0);
      await Promise.resolve();
    });
  }
};

const fill = (template: string, values: Record<string, string | number>) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{{${name}}}`).join(String(value)),
    template,
  );

function settings(measureId: string, k: 3 | 5 | 7 | 10 = 5) {
  usePolarizationSettingsStore.setState({
    ...defaultSettings(),
    ...fromSingleSeries({ measureId, paramsByMeasure: {}, k, belief: "private" }),
  });
}

const seek = vi.fn();
const renderPanel = () =>
  render(<PolarizationPanel runId="run-1" networkId="net-1" onSeekRound={seek} />);

const table = () => screen.getByRole("table", { name: pt.aria });
const group = (name: string) => within(screen.getByRole("group", { name }));
/** The rendered body rows (header row excluded), as their round. */
const bodyRounds = () =>
  within(table())
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByRole("rowheader").textContent);
const currentRow = () => table().querySelector("tr[aria-current='true']");
const setRound = async (round: number) => {
  act(() => {
    useSimulationStore.getState().updateFrame(frame(round));
  });
  await flush(1);
};
const openTable = async () => {
  fireEvent.click(group(p.viewAria).getByRole("button", { name: p.viewTable }));
  await flush();
};

/** Opens the export menu with the keyboard (Enter on the trigger) and picks a format. */
async function exportAs(name: RegExp) {
  const trigger = screen.getByRole("button", { name: pt.export });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const item = await screen.findByRole("menuitem", { name });
  fireEvent.click(item);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Polarization table", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    frames = [];
    seek.mockReset();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.mocked(simulationsApi.getPolarizationMeasures).mockReset().mockResolvedValue(catalog);
    vi.mocked(simulationsApi.computePolarization).mockReset().mockImplementation(fakeServer);
    vi.mocked(downloadCsv).mockReset();
    vi.mocked(toast.success).mockReset();
    usePolarizationCatalogStore.setState({ status: "idle", catalog: null, error: null });
    settings("BiPol");
    useRoundAggregatesStore.getState().reset();
    useSimulationStore.getState().reset();
    useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(0));
    useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(1));
    useSimulationStore.getState().updateFrame(frame(1));
    useSimulationStore.getState().setStatus("completed");
  });
  afterEach(() => vi.restoreAllMocks());

  it("Chart | Table: the same values as a table, without a new request; the choice is kept", async () => {
    renderPanel();
    await flush();
    expect(screen.getByTestId("echart")).toBeInTheDocument();
    const toggle = group(p.viewAria);
    expect(toggle.getByRole("button", { name: p.viewChart })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await openTable();
    expect(screen.queryByTestId("echart")).toBeNull();
    expect(usePolarizationSettingsStore.getState().view).toBe("table");
    expect(group(p.viewAria).getByRole("button", { name: p.viewTable })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Shared cache and scheduling: the chart's series is not requested again
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(1);
    expect(table()).toHaveAttribute("aria-rowcount", "3");
    const headers = within(table())
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual([pt.round, "BiPol · k=5 · private", pt.level]);
    expect(
      within(table()).getByRole("columnheader", {
        name: fill(pt.levelOf, { label: "BiPol · k=5 · private" }),
      }),
    ).toBeInTheDocument();
    expect(bodyRounds()).toEqual(["0", "1"]);
    expect(within(table()).getAllByText("1.0000")).toHaveLength(2);
    expect(within(table()).getAllByText(p.levels.high)).toHaveLength(2);
    // The series' settings stay above the table in series mode
    expect(screen.getByRole("group", { name: p.kAria })).toBeInTheDocument();

    fireEvent.click(group(p.viewAria).getByRole("button", { name: p.viewChart }));
    await flush();
    expect(screen.getByTestId("echart")).toBeInTheDocument();
  });

  it("highlights the current round (aria-current) and follows it", async () => {
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();
    expect(currentRow()).toHaveTextContent(/^1/);
    await setRound(0);
    expect(currentRow()).toHaveTextContent(/^0/);
    expect(table().querySelectorAll("tr[aria-current]")).toHaveLength(1);
  });

  it("a row click (or its round button) seeks to that round", async () => {
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();
    const row0 = within(table()).getAllByRole("row")[1] as HTMLElement;
    fireEvent.click(within(row0).getAllByRole("cell")[0] as HTMLElement);
    expect(seek).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: fill(pt.seekAria, { round: 1 }) }));
    expect(seek).toHaveBeenCalledTimes(2);
    expect(seek).toHaveBeenLastCalledWith(1);
  });

  it("is virtualized for long runs, and follows the playhead without fighting the user's scroll", async () => {
    for (let round = 2; round < 300; round++) {
      useRoundAggregatesStore.getState().ingest("run-1|net-1", frame(round));
    }
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();
    expect(table()).toHaveAttribute("aria-rowcount", "301");
    // Only the rows on screen (plus a few) are in the DOM
    expect(bodyRounds().length).toBeLessThan(40);

    // A seek far down brings the current row into view
    await setRound(250);
    const scroller = table().parentElement as HTMLElement;
    expect(scroller.scrollTop).toBe(HEADER_HEIGHT + 251 * ROW_HEIGHT - 320);
    expect(currentRow()).toHaveTextContent(/^250/);
    expect(bodyRounds()).not.toContain("0");

    // The user scrolls back to the top: playback does not pull the table back down …
    fireEvent.wheel(scroller);
    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    await setRound(251);
    expect(scroller.scrollTop).toBe(0);
    expect(bodyRounds()).toContain("0");
    // … but a seek does
    await setRound(120);
    expect(scroller.scrollTop).toBe(HEADER_HEIGHT + 121 * ROW_HEIGHT - 320);
    expect(currentRow()).toHaveTextContent(/^120/);
  });

  it("All measures: every catalog measure with its defaults for one k and belief, requested only when opened", async () => {
    settings("BiPol", 3);
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();
    expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(1);

    fireEvent.click(group(pt.modeAria).getByRole("button", { name: pt.modeAll }));
    await flush(30);
    expect(usePolarizationSettingsStore.getState().tableMode).toBe("all");
    // k and belief default to the selected series' ones
    expect(group(pt.allKAria).getByRole("button", { name: "3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(group(pt.allBeliefAria).getByRole("button", { name: p.beliefPrivate })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The series' settings are not shown in this mode
    expect(screen.queryByRole("group", { name: p.kAria })).toBeNull();

    const measures = vi
      .mocked(simulationsApi.computePolarization)
      .mock.calls.map(([body]) => body.measure);
    // BiPol was cached by the chart's series; Experts is not defined for k = 3
    expect(measures).not.toContain("Experts");
    expect(measures).toHaveLength(catalog.measures.length - 1);
    expect(
      vi
        .mocked(simulationsApi.computePolarization)
        .mock.calls.find(([body]) => body.measure === "EstebanRay")?.[0],
    ).toMatchObject({ params: { alpha: 0.8, K: null }, k: 3 });

    const headers = within(table()).getAllByRole("columnheader");
    expect(headers[1]).toHaveTextContent(catalog.measures[0]?.name ?? "");
    const experts = headers.find((cell) => cell.textContent?.startsWith("Experts"));
    expect(experts).toHaveTextContent(`Experts(${fill(pt.notForK, { k: 3 })})`);
    const beta = headers.find((cell) => cell.textContent?.startsWith("MEC normalized"));
    expect(beta).toHaveTextContent(p.beta);
    // Experts' cells: "—" with what it means
    expect(
      within(table()).getAllByText(fill(pt.cellUnsupported, { name: "Experts", k: 3 })),
    ).toHaveLength(2);

    // Another k: Experts (k = 5 only) is requested now
    fireEvent.click(group(pt.allKAria).getByRole("button", { name: "5" }));
    expect(usePolarizationSettingsStore.getState().allMeasuresK).toBe(5);
    await waitFor(() =>
      expect(simulationsApi.computePolarization).toHaveBeenCalledWith(
        expect.objectContaining({ measure: "Experts", k: 5 }),
      ),
    );
  });

  it("exports the series as long and wide CSV (full precision, raw levels, the package)", async () => {
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();

    await exportAs(/Long \(R \/ pandas\)/);
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [longName, longCsv] = vi.mocked(downloadCsv).mock.calls[0] ?? [];
    expect(longName).toMatch(/^polarization-series-long-runrun-1-netnet-1-\d{8}-\d{4}\.csv$/);
    expect(longCsv).toBe(
      [
        "﻿run_id;network_id;round;measure;params;k;belief;value;level;pol_measures_version;pol_measures_ref",
        `run-1;net-1;0;BiPol;;5;private;1;high;${VERSION};${REF}`,
        `run-1;net-1;1;BiPol;;5;private;1;high;${VERSION};${REF}`,
      ].join("\n"),
    );
    expect(toast.success).toHaveBeenCalledWith(
      fill(pt.exportToast_other, { display: 2, file: longName as string }),
    );

    await exportAs(/Wide \(Excel\)/);
    const [wideName, wideCsv] = vi.mocked(downloadCsv).mock.calls[1] ?? [];
    expect(wideName).toMatch(/^polarization-series-wide-runrun-1-netnet-1-/);
    expect(wideCsv).toBe(
      [
        "﻿run_id;network_id;round;BiPol (k=5, private);BiPol (k=5, private) level;pol_measures_version;pol_measures_ref",
        `run-1;net-1;0;1;high;${VERSION};${REF}`,
        `run-1;net-1;1;1;high;${VERSION};${REF}`,
      ].join("\n"),
    );
  });

  it("exports the current mode: all measures, with the measures defined for k", async () => {
    usePolarizationSettingsStore.setState({ view: "table", tableMode: "all" });
    renderPanel();
    await flush();
    await waitFor(() =>
      expect(simulationsApi.computePolarization).toHaveBeenCalledTimes(catalog.measures.length),
    );
    await flush();
    await exportAs(/Wide \(Excel\)/);
    const [name, csv] = vi.mocked(downloadCsv).mock.calls[0] ?? [];
    expect(name).toMatch(/^polarization-all-measures-wide-/);
    const header = (csv as string).split("\n")[0] ?? "";
    expect(header).toContain(";EstebanRay (k=5, private);EstebanRay (k=5, private) level;");
    expect(header).toContain(";Experts (k=5, private);");
    expect((csv as string).split("\n")).toHaveLength(3);
  });

  it("a live run: the export is partial, and says so", async () => {
    useSimulationStore.getState().setStatus("running");
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();
    expect(screen.getByText(pt.partial)).toBeInTheDocument();
    expect(screen.getAllByText(pt.partialLive).length).toBeGreaterThan(0);
    const trigger = screen.getByRole("button", { name: pt.export });
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText(pt.partialLive)).toBeInTheDocument();
  });

  it("without rounds: an empty state and nothing to export", async () => {
    useRoundAggregatesStore.getState().reset();
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();
    expect(screen.getByText(pt.emptyNoRounds)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: pt.export })).toBeDisabled();
    expect(screen.getByText(pt.exportEmpty)).toBeInTheDocument();
  });

  it("a cell not computed yet or without a value reads as such", async () => {
    let calls = 0;
    vi.mocked(simulationsApi.computePolarization).mockImplementation(async (body) => {
      calls++;
      const result = await fakeServer(body);
      // The first answer: round 1 has no value, with the package's error
      return calls === 1
        ? { ...result, values: [result.values[0] ?? null, null], errors: [null, "ValueError: x"] }
        : result;
    });
    usePolarizationSettingsStore.getState().setView("table");
    renderPanel();
    await flush();
    expect(
      within(table()).getAllByText(fill(pt.cellError, { message: "ValueError: x" })),
    ).toHaveLength(2);

    // A copy with public beliefs, not answered yet while the first one's request is in flight
    vi.mocked(simulationsApi.computePolarization).mockImplementation(() => new Promise(() => {}));
    usePolarizationSettingsStore.getState().addSeries();
    usePolarizationSettingsStore
      .getState()
      .setBelief(usePolarizationSettingsStore.getState().selectedId, "public");
    await flush();
    await waitFor(() =>
      expect(within(table()).getAllByText(pt.cellPending).length).toBeGreaterThan(0),
    );
  });
});
