import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/shared/lib/logger";
import { fakeCosmos } from "@/test/fake-cosmos";
import {
  disableDirectRepaint,
  isDirectRepaintDisabled,
  resetDirectRepaint,
  resolveCosmosDirect,
} from "./cosmos-direct";

afterEach(() => {
  resetDirectRepaint();
});

describe("resolveCosmosDirect", () => {
  it("is not ready without an instance or before cosmos.gl exists", () => {
    expect(resolveCosmosDirect(undefined)).toEqual({ status: "not-ready" });
    expect(resolveCosmosDirect({ _cosmos: undefined })).toEqual({ status: "not-ready" });
  });

  it("finds cosmos.gl in `_cosmos`, else through the internal API", () => {
    const cosmos = fakeCosmos(2);
    const viaField = resolveCosmosDirect({ _cosmos: cosmos });
    const viaApi = resolveCosmosDirect({ _internalApi: { cosmos } });
    expect(viaField.status).toBe("ready");
    expect(viaApi.status).toBe("ready");
    if (viaField.status === "ready") expect(viaField.direct.pointCount()).toBe(2);
  });

  it("prefers create() with the graph's update methods", () => {
    const r = resolveCosmosDirect({ _cosmos: fakeCosmos(1) });
    expect(r.status === "ready" && r.direct.redraw).toBe("create");
  });

  it("falls back to render() without them", () => {
    const cosmos = fakeCosmos(1) as Partial<ReturnType<typeof fakeCosmos>>;
    delete cosmos.create;
    const r = resolveCosmosDirect({ _cosmos: cosmos });
    expect(r.status === "ready" && r.direct.redraw).toBe("render");
  });

  it("reports what is missing", () => {
    const noSet = fakeCosmos(1) as Partial<ReturnType<typeof fakeCosmos>>;
    delete noSet.setPointSizes;
    expect(resolveCosmosDirect({ _cosmos: noSet })).toEqual({
      status: "unsupported",
      reason: "cosmos.gl lacks setPointSizes",
    });
    const noRedraw = fakeCosmos(1) as Partial<ReturnType<typeof fakeCosmos>>;
    delete noRedraw.create;
    delete noRedraw.render;
    expect(resolveCosmosDirect({ _cosmos: noRedraw })).toEqual({
      status: "unsupported",
      reason: "cosmos.gl lacks create/render",
    });
    expect(resolveCosmosDirect({ _cosmos: 42 })).toEqual({
      status: "unsupported",
      reason: "no cosmos.gl instance",
    });
  });
});

describe("CosmosDirect.push", () => {
  it("hands the buffers to cosmos.gl and uploads them without render()", () => {
    const cosmos = fakeCosmos(2);
    const r = resolveCosmosDirect({ _cosmos: cosmos });
    if (r.status !== "ready") throw new Error("not ready");
    const colors = new Float32Array(8).fill(0.5);
    const sizes = new Float32Array([14, 8]);
    r.direct.push(colors, sizes);
    expect(cosmos.setPointColors).toHaveBeenCalledWith(colors);
    expect(cosmos.setPointSizes).toHaveBeenCalledWith(sizes);
    expect(cosmos.graph.updatePointColor).toHaveBeenCalledOnce();
    expect(cosmos.create).toHaveBeenCalledOnce();
    expect(cosmos.render).not.toHaveBeenCalled();
    expect(r.direct.holdsColors(colors)).toBe(true);
    expect(r.direct.holdsSizes(sizes)).toBe(true);
    expect(r.direct.holdsColors(new Float32Array(8))).toBe(false);
  });

  it("keeps the simulation state on the render() path", () => {
    const cosmos = fakeCosmos(1) as ReturnType<typeof fakeCosmos>;
    delete (cosmos as Partial<typeof cosmos>).create;
    const r = resolveCosmosDirect({ _cosmos: cosmos });
    if (r.status !== "ready") throw new Error("not ready");
    r.direct.push(new Float32Array(4), new Float32Array(1));
    expect(cosmos.render).toHaveBeenLastCalledWith(0);
    cosmos.isSimulationRunning = true;
    r.direct.push(new Float32Array(4), new Float32Array(1));
    expect(cosmos.render).toHaveBeenLastCalledWith(undefined);
  });

  it("throws when cosmos.gl does not take the buffers", () => {
    const r = resolveCosmosDirect({ _cosmos: fakeCosmos(3) });
    if (r.status !== "ready") throw new Error("not ready");
    expect(() => r.direct.push(new Float32Array(8), new Float32Array(2))).toThrow(
      "cosmos.gl did not take the pushed point buffers",
    );
  });

  it("copies the drawn colours", () => {
    const cosmos = fakeCosmos(1);
    cosmos.graph.pointColors = new Float32Array([0.1, 0.2, 0.3, 1]);
    const r = resolveCosmosDirect({ _cosmos: cosmos });
    if (r.status !== "ready") throw new Error("not ready");
    const copy = r.direct.copyColors();
    expect(copy).toEqual(cosmos.graph.pointColors);
    expect(copy).not.toBe(cosmos.graph.pointColors);
  });
});

describe("session fallback", () => {
  it("disables the direct push once and logs the first reason only", () => {
    const log = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    expect(isDirectRepaintDisabled()).toBe(false);
    disableDirectRepaint(new Error("first"));
    disableDirectRepaint("second");
    expect(isDirectRepaintDisabled()).toBe(true);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[1]).toEqual(new Error("first"));
    resetDirectRepaint();
    expect(isDirectRepaintDisabled()).toBe(false);
  });
});
