import type { AxiosResponseHeaders, InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BENCH_PROBE_HISTORY_LIMIT,
  benchProbe,
  getBenchCanvas,
  getBenchProbeHistory,
  isBenchmarkHost,
  nextBenchCallId,
  registerBenchCanvas,
  resetBenchProbe,
  subscribeBenchProbe,
  withParseTiming,
} from "./bench-probe";

afterEach(() => {
  resetBenchProbe();
});

describe("benchProbe", () => {
  it("delivers events to listeners, records them and marks the performance timeline", () => {
    const mark = vi.spyOn(performance, "mark");
    const listener = vi.fn();
    const unsubscribe = subscribeBenchProbe(listener);

    const event = benchProbe("canvas-frozen", { networkId: "n1", agents: 10 });

    expect(listener).toHaveBeenCalledWith(event);
    expect(event.name).toBe("canvas-frozen");
    expect(event.detail).toEqual({ networkId: "n1", agents: 10 });
    expect(typeof event.at).toBe("number");
    expect(mark).toHaveBeenCalledWith("bench:canvas-frozen");
    expect(getBenchProbeHistory()).toEqual([event]);

    unsubscribe();
    benchProbe("canvas-error");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("defaults the detail to an empty object", () => {
    expect(benchProbe("canvas-error").detail).toEqual({});
  });

  it("keeps a bounded history (oldest dropped first)", () => {
    for (let i = 0; i < BENCH_PROBE_HISTORY_LIMIT + 5; i++) {
      benchProbe("topology-parse", { durationMs: i });
    }
    const history = getBenchProbeHistory();
    expect(history).toHaveLength(BENCH_PROBE_HISTORY_LIMIT);
    expect(history[0]?.detail.durationMs).toBe(5);
  });

  it("never throws into the product path (failing mark or listener)", () => {
    vi.spyOn(performance, "mark").mockImplementation(() => {
      throw new Error("no marks");
    });
    const good = vi.fn();
    subscribeBenchProbe(() => {
      throw new Error("bad listener");
    });
    subscribeBenchProbe(good);
    expect(() => benchProbe("canvas-layout-start")).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("hands out increasing call ids", () => {
    const a = nextBenchCallId();
    const b = nextBenchCallId();
    expect(b).toBe(a + 1);
  });
});

describe("registerBenchCanvas", () => {
  const handle = () => ({
    networkId: "n1",
    getCosmograph: () => undefined,
    setClusterMode: vi.fn(),
  });

  it("exposes the current canvas and unregisters only itself", () => {
    expect(getBenchCanvas()).toBeNull();
    const first = handle();
    const unregisterFirst = registerBenchCanvas(first);
    expect(getBenchCanvas()).toBe(first);

    const second = handle();
    const unregisterSecond = registerBenchCanvas(second);
    unregisterFirst();
    expect(getBenchCanvas()).toBe(second);
    unregisterSecond();
    expect(getBenchCanvas()).toBeNull();
  });
});

describe("isBenchmarkHost", () => {
  it.each([
    ["localhost", true],
    ["LOCALHOST", true],
    ["127.0.0.1", true],
    ["[::1]", true],
    ["::1", true],
    ["silensess.example.org", false],
    ["192.168.1.20", false],
    ["localhost.evil.com", false],
    ["", false],
  ])("%s → %s", (host, expected) => {
    expect(isBenchmarkHost(host)).toBe(expected);
  });
});

describe("withParseTiming", () => {
  const config = { url: "/x" } as InternalAxiosRequestConfig;
  const headers = {} as AxiosResponseHeaders;

  it("runs the base transformers in order with the request config and reports the time", () => {
    const seen: unknown[] = [];
    const first = vi.fn(function (this: unknown, data: string) {
      seen.push(this);
      return JSON.parse(data);
    });
    const second = vi.fn((data: { a: number }) => ({ ...data, b: 2 }));
    const onTimed = vi.fn();
    const transform = withParseTiming([first, second], onTimed);

    const out = transform.call(config, '{"a":1}', headers, 200);

    expect(out).toEqual({ a: 1, b: 2 });
    expect(first).toHaveBeenCalledWith('{"a":1}', headers, 200);
    expect(seen[0]).toBe(config);
    expect(onTimed).toHaveBeenCalledTimes(1);
    expect(onTimed.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(0);
  });

  it("accepts a single transformer or none", () => {
    const onTimed = vi.fn();
    expect(
      withParseTiming((d: string) => d.toUpperCase(), onTimed).call(config, "x", headers),
    ).toBe("X");
    expect(withParseTiming(undefined, onTimed).call(config, "raw", headers)).toBe("raw");
    expect(onTimed).toHaveBeenCalledTimes(2);
  });
});
