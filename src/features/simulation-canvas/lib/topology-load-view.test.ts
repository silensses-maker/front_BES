import { describe, expect, it } from "vitest";
import { topologyLoadView } from "./topology-load-view";

describe("topologyLoadView", () => {
  it("shows nothing once a topology is on screen, whatever the load status", () => {
    expect(topologyLoadView({ phase: "failed", error: new Error("x") }, true)).toBeNull();
    expect(topologyLoadView({ phase: "loading", progress: null }, true)).toBeNull();
  });

  it("shows nothing without a status, or when idle or ready", () => {
    expect(topologyLoadView(undefined, false)).toBeNull();
    expect(topologyLoadView({ phase: "idle" }, false)).toBeNull();
    expect(topologyLoadView({ phase: "ready" }, false)).toBeNull();
  });

  it("shows the error state with its retry when the download failed", () => {
    expect(topologyLoadView({ phase: "failed", error: new Error("503") }, false)).toEqual({
      kind: "failed",
    });
  });

  it("shows an indeterminate download before the first page gave the counts", () => {
    expect(topologyLoadView({ phase: "loading", progress: null }, false)).toEqual({
      kind: "downloading",
      pagesDone: 0,
      pagesTotal: null,
      percent: null,
    });
    expect(
      topologyLoadView(
        { phase: "loading", progress: { stage: "download", pagesDone: 0, pagesTotal: null } },
        false,
      ),
    ).toEqual({ kind: "downloading", pagesDone: 0, pagesTotal: null, percent: null });
  });

  it("shows the pages done out of the total, with the share done", () => {
    expect(
      topologyLoadView(
        { phase: "loading", progress: { stage: "download", pagesDone: 12, pagesTotal: 30 } },
        false,
      ),
    ).toEqual({ kind: "downloading", pagesDone: 12, pagesTotal: 30, percent: 40 });
    expect(
      topologyLoadView(
        { phase: "loading", progress: { stage: "download", pagesDone: 1, pagesTotal: 0 } },
        false,
      ),
    ).toMatchObject({ percent: null });
    expect(
      topologyLoadView(
        { phase: "loading", progress: { stage: "download", pagesDone: 9, pagesTotal: 3 } },
        false,
      ),
    ).toMatchObject({ percent: 100 });
  });

  it("shows the preparing step while the downloaded topology is assembled", () => {
    expect(topologyLoadView({ phase: "loading", progress: { stage: "assemble" } }, false)).toEqual({
      kind: "assembling",
    });
  });
});
