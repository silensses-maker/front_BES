import { describe, expect, it } from "vitest";
import { createRandom, deriveSeed, splitmix32 } from "./prng";

describe("createRandom", () => {
  it("is deterministic per seed", () => {
    const a = createRandom(126);
    const b = createRandom(126);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("differs between seeds", () => {
    const a = createRandom(1);
    const b = createRandom(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });

  it("returns floats in [0, 1) with a uniform-looking mean", () => {
    const random = createRandom(42);
    let sum = 0;
    let min = 1;
    let max = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const v = random();
      sum += v;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(sum / n).toBeGreaterThan(0.49);
    expect(sum / n).toBeLessThan(0.51);
  });
});

describe("splitmix32", () => {
  it("advances the state and yields unsigned 32-bit values", () => {
    const step = splitmix32(0);
    expect(step.value).toBeGreaterThanOrEqual(0);
    expect(step.value).toBeLessThan(2 ** 32);
    expect(step.next).not.toBe(0);
    expect(splitmix32(0)).toEqual(step);
  });
});

describe("deriveSeed", () => {
  it("is stable and depends on every part", () => {
    expect(deriveSeed(126, 100_000, 3)).toBe(deriveSeed(126, 100_000, 3));
    expect(deriveSeed(126, 100_000, 3)).not.toBe(deriveSeed(126, 100_000, 2));
    expect(deriveSeed(126, 100_000, 3)).not.toBe(deriveSeed(127, 100_000, 3));
    expect(deriveSeed(126, 3, 100_000)).not.toBe(deriveSeed(126, 100_000, 3));
  });
});
