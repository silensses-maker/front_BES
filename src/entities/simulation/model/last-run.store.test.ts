import { beforeEach, describe, expect, it } from "vitest";
import { useLastRunStore } from "./last-run.store";

describe("useLastRunStore", () => {
  beforeEach(() => {
    useLastRunStore.getState().clear();
  });

  it("startRun sets the run as running at round 0", () => {
    useLastRunStore.getState().setRound(42);

    useLastRunStore.getState().startRun({ runId: "run-1", name: "Mi red", networkCount: 3 });

    const state = useLastRunStore.getState();
    expect(state.runId).toBe("run-1");
    expect(state.name).toBe("Mi red");
    expect(state.networkCount).toBe(3);
    expect(state.status).toBe("running");
    expect(state.round).toBe(0);
  });

  it("startRun accepts a null name (generated runs)", () => {
    useLastRunStore.getState().startRun({ runId: "run-2", name: null, networkCount: 1 });

    expect(useLastRunStore.getState().name).toBeNull();
  });

  it("setStatus and setRound update independently", () => {
    useLastRunStore.getState().startRun({ runId: "run-1", name: null, networkCount: 1 });

    useLastRunStore.getState().setRound(17);
    useLastRunStore.getState().setStatus("completed");

    const state = useLastRunStore.getState();
    expect(state.round).toBe(17);
    expect(state.status).toBe("completed");
  });

  it("reconcile overwrites name, status, and networkCount but keeps runId", () => {
    useLastRunStore.getState().startRun({ runId: "run-1", name: null, networkCount: null });

    useLastRunStore
      .getState()
      .reconcile({ name: "Barrido 4 redes", status: "cancelled", networkCount: 4 });

    const state = useLastRunStore.getState();
    expect(state.runId).toBe("run-1");
    expect(state.name).toBe("Barrido 4 redes");
    expect(state.status).toBe("cancelled");
    expect(state.networkCount).toBe(4);
  });

  it("clear resets to the empty state", () => {
    useLastRunStore.getState().startRun({ runId: "run-1", name: "x", networkCount: 2 });

    useLastRunStore.getState().clear();

    const state = useLastRunStore.getState();
    expect(state.runId).toBeNull();
    expect(state.name).toBeNull();
    expect(state.networkCount).toBeNull();
    expect(state.round).toBe(0);
  });

  it("persistence excludes round (per-frame writes must not churn storage)", () => {
    const options = useLastRunStore.persist.getOptions();
    const partialized = options.partialize?.({
      ...useLastRunStore.getState(),
      round: 999,
    });

    expect(partialized).toBeDefined();
    expect(partialized).not.toHaveProperty("round");
    expect(partialized).toHaveProperty("runId");
    expect(partialized).toHaveProperty("status");
  });
});
