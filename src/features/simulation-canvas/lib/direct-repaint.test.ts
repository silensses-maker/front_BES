import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { logger } from "@/shared/lib/logger";
import { type FakeCosmos, fakeCosmos } from "@/test/fake-cosmos";
import { disableDirectRepaint, isDirectRepaintDisabled, resetDirectRepaint } from "./cosmos-direct";
import {
  DirectRepaintController,
  type DirectRepaintOptions,
  type RepaintInputs,
} from "./direct-repaint";
import {
  buildColorBuffer,
  buildPointTables,
  type FrameBeliefs,
  SILENT_POINT_SIZE,
  SPEAKING_POINT_SIZE,
} from "./point-colors";
import { REPAINT_CAP_MIN_SAMPLES } from "./repaint-cap";

const TABLES = buildPointTables([
  { index: 1, initialBelief: 0.2, silenceStrategy: 0 },
  { index: 0, initialBelief: 0.8, silenceStrategy: 1 },
]);

function frame(pub: number[], speaking: number[] = [0, 0]): FrameBeliefs {
  return {
    publicBelief: new Float32Array(pub),
    privateBelief: new Float32Array(pub),
    speaking: new Uint8Array(speaking),
  };
}

function inputs(f: FrameBeliefs | null, colorBy: RepaintInputs["colorBy"] = "pub"): RepaintInputs {
  return { tables: TABLES, colorBy, frame: f, round: f === null ? null : 3 };
}

function expectedColors(f: FrameBeliefs | null, colorBy: RepaintInputs["colorBy"] = "pub") {
  const out = new Float32Array(TABLES.count * 4);
  buildColorBuffer(out, TABLES, colorBy, f);
  return out;
}

/** Cosmograph's own colouring (the "base" colours) as cosmos.gl holds it after a rebuild. */
const BASE = new Float32Array([0.1, 0.1, 0.1, 1, 0.9, 0.9, 0.9, 1]);

interface Harness {
  controller: DirectRepaintController;
  cosmos: FakeCosmos;
  options: {
    onModeChange: Mock<NonNullable<DirectRepaintOptions["onModeChange"]>>;
    onRepaint: Mock<NonNullable<DirectRepaintOptions["onRepaint"]>>;
    onSkip: Mock<NonNullable<DirectRepaintOptions["onSkip"]>>;
  };
  timers: Array<{ fn: () => void; ms: number }>;
  clock: { t: number; step: number };
}

function setup(points = TABLES.count): Harness {
  const cosmos = fakeCosmos(points);
  cosmos.graph.pointColors = Float32Array.from(BASE);
  const clock = { t: 0, step: 1 };
  const timers: Harness["timers"] = [];
  const options: Harness["options"] = {
    onModeChange: vi.fn(),
    onRepaint: vi.fn(),
    onSkip: vi.fn(),
  };
  const controller = new DirectRepaintController({
    ...options,
    now: () => {
      clock.t += clock.step;
      return clock.t;
    },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {
      timers.length = 0;
    },
  });
  return { controller, cosmos, options, timers, clock };
}

beforeEach(() => {
  vi.spyOn(logger, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  resetDirectRepaint();
});

describe("DirectRepaintController — attach", () => {
  it("waits in 'pending' and only remembers the inputs", () => {
    const { controller, cosmos } = setup();
    expect(controller.mode).toBe("pending");
    controller.update(inputs(frame([0, 1])), false);
    expect(cosmos.setPointColors).not.toHaveBeenCalled();
  });

  it("asks for a retry while the instance is not available", () => {
    const { controller } = setup();
    expect(controller.attach(undefined)).toBe(false);
    expect(controller.mode).toBe("pending");
  });

  it("switches to 'direct' and paints the latest round at once", () => {
    const { controller, cosmos, options } = setup();
    const f = frame([0, 1], [1, 0]);
    controller.update(inputs(f), true);
    expect(controller.attach({ _cosmos: cosmos })).toBe(true);
    expect(controller.mode).toBe("direct");
    expect(options.onModeChange).toHaveBeenCalledWith("direct");
    expect(cosmos.create).toHaveBeenCalledOnce();
    expect(cosmos.graph.pointColors).toEqual(expectedColors(f));
    // points are agents 1, 0 → speaking 0, 1
    expect(Array.from(cosmos.graph.pointSizes)).toEqual([SILENT_POINT_SIZE, SPEAKING_POINT_SIZE]);
    expect(options.onRepaint).toHaveBeenCalledWith({ round: 3, buildMs: 1, pushMs: 1 });
  });

  it("keeps Cosmograph's own colours on screen while there is no frame", () => {
    const { controller, cosmos } = setup();
    controller.update(inputs(null), false);
    controller.attach({ _cosmos: cosmos });
    expect(cosmos.graph.pointColors).toEqual(BASE);
    expect(Array.from(cosmos.graph.pointSizes)).toEqual([8, 8]);
  });

  it("keeps the base colours when a rebuild left the points as they were", () => {
    const { controller, cosmos } = setup();
    controller.update(inputs(frame([0, 1])), false);
    controller.attach({ _cosmos: cosmos });
    // links-only rebuild: cosmos.gl still draws our colours
    controller.attach({ _cosmos: cosmos });
    controller.update(inputs(null), false);
    expect(cosmos.graph.pointColors).toEqual(BASE);
  });

  it("falls back for the session when cosmos.gl lacks the API", () => {
    const { controller, options } = setup();
    controller.update(inputs(null), false);
    expect(controller.attach({ _cosmos: { setPointColors: () => undefined } })).toBe(true);
    expect(controller.mode).toBe("fallback");
    expect(options.onModeChange).toHaveBeenCalledWith("fallback");
    expect(isDirectRepaintDisabled()).toBe(true);
    expect(logger.error).toHaveBeenCalledOnce();
    // a canvas mounted later in the session starts in the fallback
    expect(setup().controller.mode).toBe("fallback");
  });

  it("falls back instead of throwing into Cosmograph when cosmos.gl misbehaves", () => {
    const { controller, cosmos } = setup();
    controller.update(inputs(frame([0, 1])), false);
    cosmos.getPointColors.mockImplementation(() => {
      throw new Error("destroyed");
    });
    expect(() => controller.attach({ _cosmos: cosmos })).not.toThrow();
    expect(controller.mode).toBe("fallback");
  });

  it("falls back when cosmos.gl breaks after the first paint", () => {
    const { controller, cosmos } = setup();
    controller.update(inputs(frame([0, 1])), false);
    controller.attach({ _cosmos: cosmos });
    cosmos.getPointColors.mockImplementation(() => {
      throw new Error("destroyed");
    });
    expect(() => controller.configUpdated()).not.toThrow();
    expect(controller.mode).toBe("fallback");
  });

  it("keeps no base colours when reading them fails", () => {
    const { controller, cosmos } = setup();
    let calls = 0;
    const own = cosmos.getPointColors.getMockImplementation();
    cosmos.getPointColors.mockImplementation(() => {
      calls++;
      if (calls === 2) throw new Error("read failed"); // the copy, after holdsColors
      return own?.() ?? new Float32Array(0);
    });
    controller.update(inputs(null), false);
    controller.attach({ _cosmos: cosmos });
    expect(controller.mode).toBe("direct");
    // no snapshot: the initial beliefs stand in for Cosmograph's colours
    expect(cosmos.graph.pointColors).toEqual(expectedColors(null));
  });

  it("falls back when the rebuilt instance has no cosmos.gl", () => {
    const { controller } = setup();
    controller.attach({});
    expect(controller.mode).toBe("fallback");
  });

  it("does nothing once the session fell back", () => {
    disableDirectRepaint("earlier");
    const { controller, cosmos } = setup();
    expect(controller.attach({ _cosmos: cosmos })).toBe(true);
    controller.update(inputs(frame([0, 1])), false);
    expect(cosmos.setPointColors).not.toHaveBeenCalled();
  });
});

describe("DirectRepaintController — repaint", () => {
  function attached(points = TABLES.count) {
    const h = setup(points);
    h.controller.update(inputs(null), false);
    h.controller.attach({ _cosmos: h.cosmos });
    h.cosmos.create.mockClear();
    h.options.onRepaint.mockClear();
    return h;
  }

  it("pushes a new frame's colours and sizes in point order", () => {
    const { controller, cosmos } = attached();
    const f = frame([0.25, 0.75], [0, 1]);
    controller.update(inputs(f), false);
    expect(cosmos.graph.pointColors).toEqual(expectedColors(f));
    expect(Array.from(cosmos.graph.pointSizes)).toEqual([SPEAKING_POINT_SIZE, SILENT_POINT_SIZE]);
    expect(cosmos.create).toHaveBeenCalledOnce();
  });

  it("repaints on a colour-mode change and not on identical inputs", () => {
    const { controller, cosmos } = attached();
    const f = frame([0.25, 0.75]);
    controller.update(inputs(f), false);
    controller.update(inputs(f), false);
    expect(cosmos.create).toHaveBeenCalledOnce();
    controller.update(inputs(f, "estr"), false);
    expect(cosmos.graph.pointColors).toEqual(TABLES.strategyColors);
    expect(cosmos.create).toHaveBeenCalledTimes(2);
  });

  it("restores Cosmograph's colours when the frame goes away", () => {
    const { controller, cosmos } = attached();
    controller.update(inputs(null, "estr"), false);
    expect(cosmos.graph.pointColors).toEqual(TABLES.strategyColors);
    controller.update(inputs(null, "pub"), false);
    expect(cosmos.graph.pointColors).toEqual(BASE);
  });

  it("colours by initial beliefs when Cosmograph's colours were never captured", () => {
    const { controller, cosmos } = setup();
    cosmos.graph.pointColors = new Float32Array(3); // wrong length: no snapshot
    controller.update(inputs(null), false);
    controller.attach({ _cosmos: cosmos });
    expect(cosmos.graph.pointColors).toEqual(expectedColors(null));
  });

  it("does not paint onto another network", () => {
    const { controller, cosmos } = attached();
    const other = buildPointTables([{ index: 0, initialBelief: 0.5, silenceStrategy: 0 }]);
    controller.update({ ...inputs(frame([1])), tables: other }, false);
    expect(cosmos.create).not.toHaveBeenCalled();
    expect(controller.mode).toBe("direct");
  });

  it("falls back when cosmos.gl does not take the buffers", () => {
    const { controller, cosmos, options } = setup();
    // cosmos.gl keeps drawing its own array (e.g. changed internals)
    cosmos.graph.updatePointColor.mockImplementation(() => undefined);
    controller.update(inputs(frame([0, 1])), false);
    controller.attach({ _cosmos: cosmos });
    expect(controller.mode).toBe("fallback");
    expect(options.onModeChange).toHaveBeenLastCalledWith("fallback");
  });

  it("falls back when building the buffers throws", () => {
    const { controller } = attached();
    const broken = { ...TABLES, strategyColors: null as unknown as Float32Array };
    controller.update({ ...inputs(null, "estr"), tables: broken }, false);
    expect(controller.mode).toBe("fallback");
  });

  it("stops after detach and starts over on the next attach", () => {
    const { controller, cosmos, options } = attached();
    controller.detach();
    expect(controller.mode).toBe("pending");
    expect(options.onModeChange).toHaveBeenLastCalledWith("pending");
    controller.update(inputs(frame([0, 1])), false);
    expect(cosmos.create).not.toHaveBeenCalled();
    controller.attach({ _cosmos: cosmos });
    expect(cosmos.create).toHaveBeenCalledOnce();
    controller.dispose();
    expect(controller.mode).toBe("pending");
  });
});

describe("DirectRepaintController — re-push after Cosmograph updates", () => {
  it("re-pushes after Cosmograph drew its own colours, keeping them as the base", () => {
    const h = setup();
    h.controller.update(inputs(null), false);
    h.controller.attach({ _cosmos: h.cosmos });
    const f = frame([0, 1]);
    h.controller.update(inputs(f), false);
    // Cosmograph recomputes its colouring (e.g. a rebuild of the colour props)
    const own = new Float32Array([0.3, 0.3, 0.3, 1, 0.4, 0.4, 0.4, 1]);
    h.cosmos.setPointColors(own);
    h.cosmos.graph.updatePointColor();
    h.cosmos.create.mockClear();
    h.controller.configUpdated();
    expect(h.cosmos.create).toHaveBeenCalledOnce();
    expect(h.cosmos.graph.pointColors).toEqual(expectedColors(f));
    h.controller.update(inputs(null), false);
    expect(h.cosmos.graph.pointColors).toEqual(own);
  });

  it("re-pushes when only the sizes were replaced", () => {
    const h = setup();
    h.controller.update(inputs(frame([0, 1], [1, 1])), false);
    h.controller.attach({ _cosmos: h.cosmos });
    h.cosmos.setPointSizes(new Float32Array([8, 8]));
    h.cosmos.graph.updatePointSize();
    h.controller.configUpdated();
    expect(Array.from(h.cosmos.graph.pointSizes)).toEqual([14, 14]);
  });

  it("does nothing while the buffers are still ours, or before anything was painted", () => {
    const h = setup();
    h.controller.configUpdated();
    h.controller.update(inputs(frame([0, 1])), false);
    h.controller.attach({ _cosmos: h.cosmos });
    h.cosmos.create.mockClear();
    h.controller.configUpdated();
    expect(h.cosmos.create).not.toHaveBeenCalled();
  });
});

describe("DirectRepaintController — adaptive cap", () => {
  /** Attached controller whose every repaint costs `costMs` (build + push). */
  function slow(costMs: number) {
    const h = setup();
    h.controller.update(inputs(null), false);
    h.controller.attach({ _cosmos: h.cosmos });
    h.clock.step = costMs / 2;
    for (let i = 0; i < REPAINT_CAP_MIN_SAMPLES + 2; i++) {
      h.controller.update(inputs(frame([i / 10, 0.5])), false);
    }
    h.cosmos.create.mockClear();
    return h;
  }

  it("skips rounds during auto-advance and paints the latest when the interval ends", () => {
    const h = slow(30);
    expect(h.controller.capState.engaged).toBe(true);
    const latest = frame([0.9, 0.1]);
    h.controller.update(inputs(frame([0.4, 0.4])), true);
    h.controller.update(inputs(latest), true);
    expect(h.cosmos.create).not.toHaveBeenCalled();
    expect(h.options.onSkip).toHaveBeenCalledTimes(2);
    expect(h.timers).toHaveLength(1);
    h.timers[0]?.fn();
    expect(h.cosmos.create).toHaveBeenCalledOnce();
    expect(h.cosmos.graph.pointColors).toEqual(expectedColors(latest));
  });

  it("paints the last round exactly when auto-advance stops", () => {
    const h = slow(30);
    const last = frame([0.95, 0.05]);
    h.controller.update(inputs(last), true);
    expect(h.cosmos.create).not.toHaveBeenCalled();
    h.controller.flush();
    expect(h.cosmos.graph.pointColors).toEqual(expectedColors(last));
    expect(h.timers).toHaveLength(0);
    h.controller.flush();
    expect(h.cosmos.create).toHaveBeenCalledOnce();
  });

  it("never skips a seek or a manual step", () => {
    const h = slow(30);
    h.controller.update(inputs(frame([0.3, 0.3])), false);
    expect(h.cosmos.create).toHaveBeenCalledOnce();
  });

  it("stays out of the way when repaints are cheap", () => {
    const h = slow(2);
    expect(h.controller.capState.engaged).toBe(false);
    h.controller.update(inputs(frame([0.3, 0.3])), true);
    h.controller.update(inputs(frame([0.4, 0.3])), true);
    expect(h.cosmos.create).toHaveBeenCalledTimes(2);
    expect(h.options.onSkip).not.toHaveBeenCalled();
  });
});

describe("DirectRepaintController — defaults", () => {
  it("uses performance.now and real timers for the trailing repaint", () => {
    vi.useFakeTimers();
    try {
      const cosmos = fakeCosmos(TABLES.count);
      const controller = new DirectRepaintController({ onModeChange: vi.fn() });
      controller.update(inputs(null), false);
      controller.attach({ _cosmos: cosmos });
      // make every repaint look slow: engage the cap
      let t = 0;
      vi.spyOn(performance, "now").mockImplementation(() => {
        t += 15;
        return t;
      });
      for (let i = 0; i < REPAINT_CAP_MIN_SAMPLES + 1; i++) {
        controller.update(inputs(frame([i / 10, 0.5])), false);
      }
      expect(controller.capState.engaged).toBe(true);
      cosmos.create.mockClear();
      const latest = frame([0.7, 0.2]);
      controller.update(inputs(latest), true);
      expect(cosmos.create).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(cosmos.graph.pointColors).toEqual(expectedColors(latest));
      // dispose (unmount) cancels a pending trailing repaint
      controller.update(inputs(frame([0.1, 0.1])), true);
      controller.dispose();
      vi.runAllTimers();
      expect(cosmos.create).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
