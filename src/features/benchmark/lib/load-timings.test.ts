import { describe, expect, it } from "vitest";
import type { BenchProbeEvent, BenchProbeName } from "@/shared/lib/bench-probe";
import { deriveLoadTimings } from "./load-timings";

const RUN = "run-1";
const NET = "net-1";
const ev = (name: BenchProbeName, at: number, detail: BenchProbeEvent["detail"] = {}) => ({
  name,
  at,
  detail: { runId: RUN, networkId: NET, ...detail },
});

describe("deriveLoadTimings", () => {
  it("measures fetch, parse, network and every canvas step of the winning fetch", () => {
    const events: BenchProbeEvent[] = [
      ev("topology-fetch-start", 100, { callId: 1 }),
      ev("topology-fetch-start", 120, { callId: 2 }),
      ev("topology-parse", 400, { durationMs: 30 }),
      ev("topology-parse", 500, { durationMs: 20 }),
      ev("topology-fetch-end", 900, { callId: 2 }),
      ev("topology-parse", 950, { durationMs: 99 }),
      ev("topology-fetch-end", 1_000, { callId: 1 }),
      ev("canvas-prepare-start", 1_010),
      ev("canvas-to-data-end", 1_110),
      ev("canvas-prepare-end", 1_610),
      ev("canvas-layout-start", 1_700),
      ev("canvas-frozen", 6_700),
      // another network's events are ignored
      { name: "canvas-frozen", at: 9_000, detail: { networkId: "other" } },
    ];
    const resources = [
      {
        name: `http://x/api/simulations/run-1/networks/${NET}/topology?a=0`,
        startTime: 121,
        responseEnd: 600,
      },
      {
        name: `http://x/api/simulations/run-1/networks/${NET}/topology?a=1`,
        startTime: 125,
        responseEnd: 850,
      },
      { name: "http://x/other", startTime: 130, responseEnd: 9_999 },
    ];
    expect(deriveLoadTimings(events, RUN, NET, resources)).toEqual({
      generateMs: null,
      fetchMs: 780,
      networkMs: 730,
      parseMs: 50,
      toDataMs: 100,
      prepareMs: 500,
      mountMs: 90,
      layoutMs: 5_000,
      uploadMs: null,
      totalMs: 6_580,
      topologyFetches: 2,
      topologyShared: 0,
    });
  });

  it("counts the loads that joined the download in flight without changing its timings (#140)", () => {
    const events: BenchProbeEvent[] = [
      ev("topology-fetch-start", 100, { callId: 1 }),
      ev("topology-fetch-join", 130),
      ev("topology-parse", 400, { durationMs: 30 }),
      ev("topology-fetch-end", 900, { callId: 1 }),
      ev("canvas-prepare-start", 910),
      ev("canvas-frozen", 5_910),
    ];
    const t = deriveLoadTimings(events, RUN, NET);
    expect(t.topologyFetches).toBe(1);
    expect(t.topologyShared).toBe(1);
    expect(t.fetchMs).toBe(800);
    expect(t.parseMs).toBe(30);
    expect(t.totalMs).toBe(5_810);
  });

  it("treats a load reused from an earlier download as from memory: no fetch steps, total from the reuse", () => {
    const events: BenchProbeEvent[] = [
      // Selector: downloads the first network
      ev("topology-fetch-start", 100, { callId: 1 }),
      ev("topology-parse", 400, { durationMs: 30 }),
      ev("topology-fetch-end", 900, { callId: 1 }),
      // The user opens it 20 s later: the run view reuses that download
      ev("topology-fetch-reuse", 20_000),
      ev("canvas-prepare-start", 20_010),
      ev("canvas-to-data-end", 20_110),
      ev("canvas-frozen", 25_010),
    ];
    const resources = [
      {
        name: `http://x/api/simulations/run-1/networks/${NET}/topology?a=0`,
        startTime: 101,
        responseEnd: 850,
      },
    ];
    const t = deriveLoadTimings(events, RUN, NET, resources);
    expect(t.topologyFetches).toBe(1);
    expect(t.topologyShared).toBe(1);
    expect(t.fetchMs).toBeNull();
    expect(t.networkMs).toBeNull();
    expect(t.parseMs).toBeNull();
    expect(t.toDataMs).toBe(100);
    expect(t.totalMs).toBe(5_010);
  });

  it("measures the download again when the network was downloaded after its last reuse", () => {
    const events: BenchProbeEvent[] = [
      ev("topology-fetch-reuse", 50),
      ev("topology-fetch-start", 100, { callId: 1 }),
      ev("topology-fetch-end", 600, { callId: 1 }),
      ev("canvas-prepare-start", 610),
      ev("canvas-frozen", 1_610),
    ];
    const t = deriveLoadTimings(events, RUN, NET);
    expect(t.fetchMs).toBe(500);
    expect(t.totalMs).toBe(1_510);
    expect(t.topologyShared).toBe(1);
  });

  it("reports zero downloads when the reused download is no longer in the event history", () => {
    const events: BenchProbeEvent[] = [
      ev("topology-fetch-reuse", 10),
      ev("canvas-prepare-start", 20),
      ev("canvas-frozen", 1_020),
    ];
    const t = deriveLoadTimings(events, RUN, NET);
    expect(t.topologyFetches).toBe(0);
    expect(t.topologyShared).toBe(1);
    expect(t.fetchMs).toBeNull();
    expect(t.totalMs).toBe(1_010);
  });

  it("measures the upload: layout commit → first tick after the data was rebuilt", () => {
    const events: BenchProbeEvent[] = [
      ev("canvas-prepare-start", 0),
      ev("canvas-layout-start", 100),
      ev("cosmograph-first-tick", 120),
      ev("cosmograph-graph-rebuilt", 900),
      ev("cosmograph-first-tick", 950),
      ev("canvas-frozen", 5_100),
    ];
    const t = deriveLoadTimings(events, RUN, NET);
    expect(t.uploadMs).toBe(850);
    expect(t.layoutMs).toBe(5_000);
  });

  it("uses the last canvas cycle and leaves unobserved steps null", () => {
    const events: BenchProbeEvent[] = [
      ev("canvas-prepare-start", 10),
      ev("canvas-to-data-end", 20),
      ev("canvas-prepare-start", 100),
      ev("canvas-to-data-end", 130),
    ];
    const t = deriveLoadTimings(events, RUN, NET);
    expect(t.toDataMs).toBe(30);
    expect(t.prepareMs).toBeNull();
    expect(t.fetchMs).toBeNull();
    expect(t.networkMs).toBeNull();
    expect(t.parseMs).toBeNull();
    expect(t.topologyFetches).toBeNull();
    expect(t.totalMs).toBeNull();
  });

  it("returns all nulls without events", () => {
    const t = deriveLoadTimings([], RUN, NET);
    expect(Object.values(t).every((v) => v === null)).toBe(true);
  });

  it("falls back to the first start when the end has no matching call id", () => {
    const events: BenchProbeEvent[] = [
      ev("topology-fetch-start", 0, { callId: 1 }),
      ev("topology-fetch-end", 50, { callId: 7 }),
    ];
    expect(deriveLoadTimings(events, RUN, NET).fetchMs).toBe(50);
  });
});
