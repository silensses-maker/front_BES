import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/shared/lib/logger";
import { useLaunchedConfigStore } from "./launched-config.store";

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

const STORAGE_KEY = "bes-launched-config";

const generatedConfig = { networkType: "generated", numberOfAgents: 10, seed: null };

describe("useLaunchedConfigStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLaunchedConfigStore.getState().clear();
  });

  it("starts empty", () => {
    const state = useLaunchedConfigStore.getState();
    expect(state.runId).toBeNull();
    expect(state.config).toBeNull();
  });

  it("record keeps the run id and the configuration it was launched with", () => {
    useLaunchedConfigStore.getState().record("run-1", generatedConfig);

    const state = useLaunchedConfigStore.getState();
    expect(state.runId).toBe("run-1");
    expect(state.config).toEqual(generatedConfig);
  });

  it("a new launch replaces the previous run's configuration", () => {
    useLaunchedConfigStore.getState().record("run-1", generatedConfig);
    const customConfig = { networkType: "custom", networkName: "Red" };

    useLaunchedConfigStore.getState().record("run-2", customConfig);

    const state = useLaunchedConfigStore.getState();
    expect(state.runId).toBe("run-2");
    expect(state.config).toEqual(customConfig);
  });

  it("persists under its own key (survives a reload)", () => {
    useLaunchedConfigStore.getState().record("run-1", generatedConfig);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(stored.state).toEqual({ runId: "run-1", config: generatedConfig });
  });

  it("keeps the configuration in memory and logs when localStorage rejects it (quota)", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() =>
      useLaunchedConfigStore.getState().record("run-big", generatedConfig),
    ).not.toThrow();

    expect(useLaunchedConfigStore.getState().runId).toBe("run-big");
    expect(useLaunchedConfigStore.getState().config).toEqual(generatedConfig);
    expect(logger.error).toHaveBeenCalledWith("launchedConfig.record", expect.any(DOMException));
    setItem.mockRestore();
  });

  it("clear resets to the empty state", () => {
    useLaunchedConfigStore.getState().record("run-1", generatedConfig);

    useLaunchedConfigStore.getState().clear();

    const state = useLaunchedConfigStore.getState();
    expect(state.runId).toBeNull();
    expect(state.config).toBeNull();
  });
});
