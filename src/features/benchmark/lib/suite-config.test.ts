import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUITE_CONFIG,
  estimateLoadMs,
  estimateScenarioMs,
  estimateSuiteMs,
  expandMatrix,
  formatDuration,
  LOD_PRESET_CONFIG,
  parseSuiteQuery,
  type SuiteConfig,
  suiteQuery,
  validateSuiteConfig,
  variantPhases,
} from "./suite-config";

const TIMINGS = { layoutMs: 5_000, clusterMs: 4_000, declusterMs: 2_000 };

describe("expandMatrix", () => {
  it("runs repetitions as the outer loop and skips densities ≥ size", () => {
    const specs = expandMatrix({
      ...DEFAULT_SUITE_CONFIG,
      sizes: [5, 3, 5],
      densities: [3, 2],
      repetitions: 2,
    });
    expect(specs.map((s) => s.id)).toEqual([
      "n3-d2-r1",
      "n5-d2-r1",
      "n5-d3-r1",
      "n3-d2-r2",
      "n5-d2-r2",
      "n5-d3-r2",
    ]);
    expect(specs.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("covers the default matrix: 5 sizes × 3 densities × 3 repetitions", () => {
    expect(expandMatrix(DEFAULT_SUITE_CONFIG)).toHaveLength(45);
  });
});

describe("duration estimate", () => {
  it("adds settle, load, layout and every selected phase", () => {
    const config: SuiteConfig = {
      ...DEFAULT_SUITE_CONFIG,
      warmupMs: 1_000,
      measureMs: 4_000,
      settleMs: 500,
      repaintSpeeds: [1, 16],
    };
    const spec = { agents: 10_000, density: 2 };
    const phase = 5_000;
    const expected =
      500 +
      estimateLoadMs(10_000, 2) +
      5_000 +
      phase +
      phase +
      2 * phase +
      (4_000 + 500 + 2 * phase + 2_000 + 500);
    expect(estimateScenarioMs(spec, config, TIMINGS)).toBe(expected);
    expect(estimateScenarioMs(spec, { ...config, phases: ["idle"] }, TIMINGS)).toBe(
      500 + estimateLoadMs(10_000, 2) + 5_000 + phase,
    );
  });

  it("grows with the network and sums over the matrix", () => {
    expect(estimateLoadMs(100_000, 3)).toBeGreaterThan(estimateLoadMs(10_000, 3));
    const one = {
      ...DEFAULT_SUITE_CONFIG,
      sizes: [10_000],
      densities: [2],
      repetitions: 1,
      prewarm: false,
    };
    expect(estimateSuiteMs({ ...one, repetitions: 3 }, TIMINGS)).toBeCloseTo(
      3 * estimateSuiteMs(one, TIMINGS),
    );
    // the pre-warm adds one load-only scenario
    expect(estimateSuiteMs({ ...one, prewarm: true }, TIMINGS)).toBe(
      // settle + load + layout of the 500-agent network
      estimateSuiteMs(one, TIMINGS) + 2_000 + estimateLoadMs(500, 2) + 5_000,
    );
    // The default suite is a long but bounded run (about an hour)
    const minutes = estimateSuiteMs(DEFAULT_SUITE_CONFIG, TIMINGS) / 60_000;
    expect(minutes).toBeGreaterThan(45);
    expect(minutes).toBeLessThan(120);
  });

  it("formats durations", () => {
    expect(formatDuration(42_400)).toBe("42 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
    expect(formatDuration(3_900_000)).toBe("1 h 5 min");
  });
});

describe("validateSuiteConfig", () => {
  it("accepts the defaults", () => {
    expect(validateSuiteConfig(DEFAULT_SUITE_CONFIG)).toEqual([]);
  });

  it("reports every invalid field", () => {
    const errors = validateSuiteConfig({
      ...DEFAULT_SUITE_CONFIG,
      sizes: [],
      densities: [1.5],
      repetitions: 0,
      measureMs: 0,
      warmupMs: -1,
      phases: [],
      seed: 0.5,
    });
    expect(errors).toHaveLength(7);
    expect(
      validateSuiteConfig({ ...DEFAULT_SUITE_CONFIG, phases: ["repaint"], repaintSpeeds: [] }),
    ).toEqual(["Select at least one playback speed for the repaint phase."]);
    expect(validateSuiteConfig({ ...DEFAULT_SUITE_CONFIG, sizes: [3], densities: [3] })).toEqual([
      "No scenario left: every density must be lower than the network size.",
    ]);
  });
});

describe("suite query", () => {
  it("parses overrides (seconds, k suffix, phases, stage, autorun)", () => {
    const { config, autorun } = parseSuiteQuery(
      "?sizes=1k,5000&densities=3&reps=1&warmup=0.5&measure=2&settle=0&phases=idle,bogus,repaint&speeds=1,16&cluster=belief&seed=7&stage=800x600&ring=8&autorun=1",
    );
    expect(autorun).toBe(true);
    expect(config).toMatchObject({
      sizes: [1_000, 5_000],
      densities: [3],
      repetitions: 1,
      warmupMs: 500,
      measureMs: 2_000,
      settleMs: 0,
      phases: ["idle", "repaint"],
      repaintSpeeds: [1, 16],
      clusterMode: "belief",
      seed: 7,
      stage: { width: 800, height: 600 },
      ringRounds: 8,
    });
    expect(parseSuiteQuery("?prewarm=0").config.prewarm).toBe(false);
    expect(parseSuiteQuery("?prewarm=yes").config.prewarm).toBe(true);
  });

  it("keeps the base for absent or invalid values", () => {
    const { config, autorun } = parseSuiteQuery("?sizes=abc&cluster=nope&stage=huge&measure=x");
    expect(autorun).toBe(false);
    expect(config.sizes).toEqual(DEFAULT_SUITE_CONFIG.sizes);
    expect(config.clusterMode).toBe(DEFAULT_SUITE_CONFIG.clusterMode);
    expect(config.stage).toEqual(DEFAULT_SUITE_CONFIG.stage);
    expect(config.measureMs).toBe(DEFAULT_SUITE_CONFIG.measureMs);
    expect(parseSuiteQuery("?stage=fill").config.stage).toBe("fill");
  });

  it("round-trips through suiteQuery", () => {
    const config: SuiteConfig = {
      ...DEFAULT_SUITE_CONFIG,
      sizes: [1_000],
      densities: [2, 5],
      phases: ["layout", "cluster"],
      stage: "fill",
    };
    const parsed = parseSuiteQuery(`?${suiteQuery(config)}`).config;
    expect(parsed).toEqual(config);
    expect(parseSuiteQuery(`?${suiteQuery(DEFAULT_SUITE_CONFIG)}`).config).toEqual(
      DEFAULT_SUITE_CONFIG,
    );
  });
});

describe("LOD preset and canvas variants", () => {
  it("is reachable by URL, keeps the large networks and every variant", () => {
    const { config, preset } = parseSuiteQuery("?preset=lod");
    expect(preset).toBe("lod");
    expect(config).toEqual(LOD_PRESET_CONFIG);
    expect(config.sizes).toEqual([50_000, 100_000, 150_000]);
    expect(config.phases).toEqual(["idle", "interaction"]);
    expect(config.canvasVariants).toEqual([
      "links-transparent",
      "links-off",
      "straight-links",
      "one-link-per-pair",
    ]);
    expect(expandMatrix(config)).toHaveLength(27);
    // overrides apply on top of the preset
    expect(parseSuiteQuery("?preset=lod&reps=1&variants=links-off,bogus").config).toMatchObject({
      repetitions: 1,
      canvasVariants: ["links-off"],
    });
    expect(parseSuiteQuery("?preset=nope").preset).toBeNull();
    expect(parseSuiteQuery(`?${suiteQuery(LOD_PRESET_CONFIG)}`).config).toEqual(LOD_PRESET_CONFIG);
  });

  it("adds each variant's phases (and a reload for one-link-per-pair) to the estimate", () => {
    const base = { ...LOD_PRESET_CONFIG, canvasVariants: [] };
    const spec = { agents: 100_000, density: 3 };
    const phase = base.warmupMs + base.measureMs;
    const plain = estimateScenarioMs(spec, base, TIMINGS);
    expect(
      estimateScenarioMs(spec, { ...base, canvasVariants: ["links-off"] }, TIMINGS) - plain,
    ).toBe(500 + 2 * phase);
    expect(
      estimateScenarioMs(spec, { ...base, canvasVariants: ["one-link-per-pair"] }, TIMINGS) - plain,
    ).toBeCloseTo(base.settleMs + 1_500 + 0.01 * (100_000 + 300_000) + 5_000 + 2 * phase);
    expect(variantPhases({ ...DEFAULT_SUITE_CONFIG, repaintSpeeds: [] })).toEqual([
      "idle",
      "interaction",
    ]);
    // The LOD preset runs about as long as the default suite
    const minutes = estimateSuiteMs(LOD_PRESET_CONFIG, TIMINGS) / 60_000;
    expect(minutes).toBeGreaterThan(50);
    expect(minutes).toBeLessThan(90);
  });

  it("needs a phase that variants are measured in", () => {
    expect(
      validateSuiteConfig({
        ...DEFAULT_SUITE_CONFIG,
        phases: ["layout"],
        canvasVariants: ["links-off"],
      }),
    ).toEqual([
      "Canvas variants are measured in idle, interaction or repaint: select one of them.",
    ]);
  });
});
