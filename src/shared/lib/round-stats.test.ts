import { describe, expect, it } from "vitest";
import { FINE_BINS } from "./polarization/binning";
import { computeRoundStats } from "./round-stats";

const f32 = (values: number[]) => new Float32Array(values);

describe("computeRoundStats", () => {
  it("computes means, spread (private max − min) and participation", () => {
    const stats = computeRoundStats(f32([0.2, 0.4]), f32([0.25, 0.85]), new Uint8Array([1, 0]), {
      fineHistograms: false,
    });
    expect(stats.meanPublic).toBeCloseTo(0.3, 6);
    expect(stats.meanPrivate).toBeCloseTo(0.55, 6);
    expect(stats.spread).toBeCloseTo(0.6, 6);
    expect(stats.participation).toBe(0.5);
    expect(stats.fine).toBeNull();
  });

  it("computes the exact two-pass population variance of each belief type", () => {
    const pub = f32([0, 0.25, 0.5, 1]);
    const priv = f32([0.3, 0.3, 0.3, 0.3]);
    const stats = computeRoundStats(pub, priv, new Uint8Array(4), { fineHistograms: false });
    const mean = (0 + 0.25 + 0.5 + 1) / 4;
    const expected = [0, 0.25, 0.5, 1].reduce((s, b) => s + (b - mean) ** 2, 0) / 4;
    expect(stats.variancePublic).toBeCloseTo(expected, 15);
    expect(stats.variancePrivate).toBe(0);
  });

  it("stays accurate where a one-pass formula cancels (beliefs near 1, tiny spread)", () => {
    const n = 10_000;
    const pub = new Float32Array(n);
    for (let i = 0; i < n; i++) pub[i] = Math.fround(0.999 + (i % 2) * 1e-4);
    const stats = computeRoundStats(pub, pub, new Uint8Array(n), { fineHistograms: false });
    const a = Math.fround(0.999);
    const b = Math.fround(0.9991);
    expect(stats.variancePublic).toBeCloseTo(((b - a) / 2) ** 2, 13);
  });

  it("bins both belief types into the 210-bin fine histograms when asked", () => {
    const stats = computeRoundStats(
      f32([0, 0.5, 1, 1]),
      f32([0.1, 0.1, 0.9, 0.99]),
      new Uint8Array(4),
      {
        fineHistograms: true,
      },
    );
    expect(stats.fine?.public).toHaveLength(FINE_BINS);
    expect(stats.fine?.public[0]).toBe(1);
    expect(stats.fine?.public[105]).toBe(1);
    expect(stats.fine?.public[209]).toBe(2);
    expect(stats.fine?.private.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("returns zeros for an empty frame (fine histograms empty but present)", () => {
    const stats = computeRoundStats(f32([]), f32([]), new Uint8Array(0), { fineHistograms: true });
    expect(stats).toMatchObject({
      meanPublic: 0,
      meanPrivate: 0,
      spread: 0,
      participation: 0,
      variancePublic: 0,
      variancePrivate: 0,
    });
    expect(stats.fine?.public.every((c) => c === 0)).toBe(true);
  });
});
