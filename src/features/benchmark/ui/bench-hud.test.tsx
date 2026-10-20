import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { benchProbe, resetBenchProbe } from "@/shared/lib/bench-probe";
import {
  generateSyntheticTopology,
  syntheticNetworkId,
  syntheticRunId,
} from "../lib/synthetic-topology";
import { BenchHud } from "./bench-hud";

/**
 * The run-view debug HUD (#126) with mocked data: a synthetic topology as the "current network"
 * and probe events standing in for the real fetch / canvas path (no backend involved).
 */

const SEED = 3;
const RUN = syntheticRunId(SEED);
const NET = syntheticNetworkId(SEED);
const topology = generateSyntheticTopology({
  agents: 100,
  density: 2,
  seed: SEED,
  runId: RUN,
  networkId: NET,
});

function emitLoad() {
  const d = { runId: RUN, networkId: NET, agents: 100, edges: topology.edges.length };
  // Moves the faked performance clock to `ms` (relative times are what the HUD shows)
  const start = performance.now();
  const at = (ms: number) => vi.advanceTimersByTime(start + ms - performance.now());
  at(1_000);
  benchProbe("topology-fetch-start", { runId: RUN, networkId: NET, callId: 1 });
  at(1_400);
  benchProbe("topology-parse", { runId: RUN, networkId: NET, durationMs: 12 });
  at(1_780);
  benchProbe("topology-fetch-end", { ...d, callId: 1 });
  at(1_800);
  benchProbe("canvas-prepare-start", d);
  at(1_850);
  benchProbe("canvas-to-data-end", d);
  at(2_350);
  benchProbe("canvas-prepare-end", d);
  at(2_400);
  benchProbe("canvas-layout-start", d);
  at(7_400);
  benchProbe("canvas-frozen", d);
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
      "Date",
    ],
  });
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetBenchProbe();
});

describe("BenchHud", () => {
  it("toggles with Shift+H and shows the network and its load timings", async () => {
    emitLoad();
    render(<BenchHud runId={RUN} networkId={NET} topology={topology} />);
    expect(screen.getByRole("button", { name: "FPS HUD" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "H", shiftKey: true });
    const hud = screen.getByRole("complementary", { name: "Benchmark HUD" });
    expect(hud).toHaveAttribute("data-harness", "silensess-bench-harness");
    expect(sessionStorage.getItem("silensess.benchHud.open")).toBe("1");

    expect(screen.getByText("100 / 394")).toBeInTheDocument();
    const row = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(row("density (inferred)")).toBe("2");
    expect(row("topology fetch")).toBe("780 ms");
    expect(row("· JSON parse")).toBe("12 ms");
    expect(row("topologyToData")).toBe("50 ms");
    expect(row("prepareCosmographData")).toBe("500 ms");
    expect(row("mount")).toBe("50 ms");
    expect(row("layout until freeze")).toBe("5000 ms");
    expect(row("total")).toBe("6400 ms");
    expect(row("topology fetches")).toBe("1");

    // Live FPS readout from the HUD's own rAF loop
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(Number(row("median"))).toBeGreaterThan(30);

    // Typing in a field does not toggle it
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "H", shiftKey: true });
    expect(screen.getByRole("complementary", { name: "Benchmark HUD" })).toBeInTheDocument();
    input.remove();

    fireEvent.click(screen.getByRole("button", { name: "Close the benchmark HUD" }));
    expect(screen.getByRole("button", { name: "FPS HUD" })).toBeInTheDocument();
  });

  it("copies a JSON snapshot, with a manual fallback when the clipboard fails", async () => {
    sessionStorage.setItem("silensess.benchHud.open", "1");
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<BenchHud runId={RUN} networkId={NET} topology={topology} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy metrics" }));
    });
    const snapshot = JSON.parse(writeText.mock.calls[0]?.[0] as string);
    expect(snapshot).toMatchObject({
      harness: "silensess-bench-harness",
      kind: "hud-snapshot",
      network: { runId: RUN, networkId: NET, agents: 100, edges: 394, density: 2 },
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copied" }));
    });
    const fallback = screen.getByLabelText(
      "Metrics JSON (clipboard unavailable)",
    ) as HTMLTextAreaElement;
    expect(fallback.value).toContain('"kind": "hud-snapshot"');
  });

  it("records 10 s with the suite statistics and offers the result as JSON and CSV", async () => {
    sessionStorage.setItem("silensess.benchHud.open", "1");
    const create = vi.fn(() => "blob:hud");
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<BenchHud runId={RUN} networkId={NET} topology={topology} />);

    // Environment + refresh-rate sampling (1 s of idle frames) enable the Record button
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    const record = screen.getByRole("button", { name: "Record 10 s" });
    expect(record).toBeEnabled();

    await act(async () => {
      fireEvent.click(record);
    });
    expect(screen.getByRole("button", { name: "Recording 10 s…" })).toBeDisabled();
    expect(screen.getByText("FPS (paused while recording)")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });

    expect(screen.getByText("Last recording (10 s)")).toBeInTheDocument();
    const [median] = (
      screen.getByText("mean / 1% low / median").nextElementSibling?.textContent ?? ""
    ).split(" / ");
    expect(Number(median)).toBeGreaterThan(30);

    fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(click).toHaveBeenCalledTimes(2);
    const blobs = create.mock.calls.map((c) => (c as unknown as [Blob])[0]);
    const json = JSON.parse(await blobs[0]!.text());
    expect(json).toMatchObject({
      schemaVersion: 2,
      kind: "hud-record",
      complete: true,
      scenarios: [
        { source: "real-run", agents: 100, density: 2, phases: [{ phase: "hud-record" }] },
      ],
    });
    expect((await blobs[1]!.text()).split("\r\n")[0]).toMatch(/^result_id,kind,schema_version/);
  });
});
