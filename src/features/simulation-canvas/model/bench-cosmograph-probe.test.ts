import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type BenchProbeEvent,
  resetBenchProbe,
  subscribeBenchProbe,
} from "@/shared/lib/bench-probe";
import { attachCosmographProbe, readCosmographRenderer } from "./bench-cosmograph-probe";

// Cosmograph's internal API object (instance._internalApi): an EventTarget per instance.
function fakeInstance(gl: unknown = null) {
  const target = new EventTarget();
  const canvas = { getContext: vi.fn(() => gl) };
  const api = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    cosmosElement: { querySelector: () => canvas },
  };
  const setConfig = vi.fn(async (_config?: unknown) => {});
  const instance = { _internalApi: api, setConfig };
  const fire = (type: string) => target.dispatchEvent(new Event(type));
  return { instance, setConfig, fire };
}

afterEach(() => {
  resetBenchProbe();
});

describe("attachCosmographProbe", () => {
  it("forwards lifecycle events and reports only the first tick after each data change", () => {
    const events: BenchProbeEvent[] = [];
    subscribeBenchProbe((e) => events.push(e));
    const { instance, fire } = fakeInstance();
    const probe = attachCosmographProbe(instance as never, { networkId: "n" });

    fire("onSimulationTick"); // before any data: still reported (fallback)
    fire("onSimulationTick");
    fire("graphRebuilt");
    fire("onSimulationTick");
    fire("onSimulationTick");
    fire("clustersUpdated");
    fire("onSimulationStart");
    fire("onSimulationTick");
    fire("onSimulationEnd");
    fire("pointColorUpdated");

    expect(events.map((e) => e.name)).toEqual([
      "cosmograph-first-tick",
      "cosmograph-graph-rebuilt",
      "cosmograph-first-tick",
      "cosmograph-clusters-updated",
      "cosmograph-simulation-start",
      "cosmograph-first-tick",
      "cosmograph-simulation-end",
      "cosmograph-colors-updated",
    ]);
    expect(events.every((e) => e.detail.networkId === "n")).toBe(true);

    probe.detach();
    fire("graphRebuilt");
    expect(events).toHaveLength(8);
  });

  it("times setConfig calls and restores the method on detach", async () => {
    const events: BenchProbeEvent[] = [];
    subscribeBenchProbe((e) => events.push(e));
    const { instance, setConfig } = fakeInstance();
    const probe = attachCosmographProbe(instance as never, { networkId: "n" });
    expect(instance.setConfig).not.toBe(setConfig);

    const call = instance.setConfig({ pointColorBy: "x" });
    expect(probe.pending()).toBe(1);
    await call;
    await Promise.resolve();
    expect(probe.pending()).toBe(0);
    expect(setConfig).toHaveBeenCalledWith({ pointColorBy: "x" });
    const done = events.find((e) => e.name === "cosmograph-config-done");
    expect(done?.detail.durationMs).toBeGreaterThanOrEqual(0);
    expect(done?.detail.syncMs).toBeGreaterThanOrEqual(0);

    // a rejected update is not left pending
    setConfig.mockRejectedValueOnce(new Error("destroyed"));
    await instance.setConfig({}).catch(() => {});
    await Promise.resolve();
    expect(probe.pending()).toBe(0);

    probe.detach();
    expect(instance.setConfig).toBe(setConfig);
  });

  it("tolerates a missing internal API", () => {
    const setConfig = vi.fn(async () => {});
    attachCosmographProbe({ setConfig } as never, {}).detach();
    expect(readCosmographRenderer(undefined)).toBeNull();
    expect(readCosmographRenderer({ setConfig } as never)).toBeNull();
  });
});

describe("readCosmographRenderer", () => {
  it("reads the unmasked renderer of the canvas' own context", () => {
    const gl = {
      RENDERER: 1,
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }),
      getParameter: (p: number) => (p === 2 ? "ANGLE (NVIDIA RTX 3070)" : "WebKit WebGL"),
    };
    expect(readCosmographRenderer(fakeInstance(gl).instance as never)).toBe(
      "ANGLE (NVIDIA RTX 3070)",
    );
    const basic = { ...gl, getExtension: () => null, getParameter: () => "WebKit WebGL" };
    expect(readCosmographRenderer(fakeInstance(basic).instance as never)).toBe("WebKit WebGL");
    const broken = {
      ...gl,
      getParameter: () => {
        throw new Error("lost");
      },
    };
    expect(readCosmographRenderer(fakeInstance(broken).instance as never)).toBeNull();
  });
});
