import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import type { GeneratedRunConfig } from "@/shared/api/backend";
import { simulationsApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";
import { computeMaxEdges } from "../lib/validation";
import { useSimulationConfigStore } from "./simulation-config.store";
import { useRelaunchRun } from "./use-relaunch-run";

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/entities/user", () => ({ useAuthStore: vi.fn() }));

vi.mock("@/shared/api/backend", () => ({ simulationsApi: { getConfig: vi.fn() } }));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/shared/lib/logger", () => ({ logger: { error: vi.fn() } }));

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Launched from the wizard by a Researcher (densityFactor 0.75) with density 4 → m = 3. */
const config: GeneratedRunConfig = {
  runId: "run-7",
  type: "generated",
  numberOfNetworks: 2,
  agentsPerNetwork: 12,
  effectiveDensity: 3,
  iterationLimit: 80,
  stopThreshold: 0.01,
  seed: "123456789",
  frameRetention: "ephemeral",
  agentTypes: [{ silenceStrategy: 1, silenceEffect: 2, count: 12 }],
  biasTypes: [{ biasType: 0, count: computeMaxEdges(4, 12) }],
};

function sessionWithFactor(densityFactor: number | null) {
  const state = {
    user:
      densityFactor === null
        ? null
        : { usageLimits: { maxAgents: 1000, maxIterations: 1000, densityFactor } },
  };
  vi.mocked(useAuthStore).mockImplementation(((selector: (s: typeof state) => unknown) =>
    selector(state)) as unknown as typeof useAuthStore);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useRelaunchRun (#127)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    sessionWithFactor(0.75);
  });

  it("pre-fills the wizard with the stored configuration and opens it, without launching", async () => {
    vi.mocked(simulationsApi.getConfig).mockResolvedValue(config);
    const { result } = renderHook(() => useRelaunchRun());

    await act(async () => {
      await result.current.relaunch("run-7");
    });

    expect(simulationsApi.getConfig).toHaveBeenCalledWith("run-7");
    const state = useSimulationConfigStore.getState();
    expect(state.networkType).toBe("generated");
    expect(state.step).toBe("review");
    expect(state.generatedValues).toMatchObject({
      numberOfAgents: 12,
      numberOfNetworks: 2,
      density: 4,
      iterationLimit: 80,
      seed: 123456789,
    });
    expect(state.relaunchedFrom).toEqual({
      runId: "run-7",
      seed: "123456789",
      seedKept: true,
      densityExact: true,
      effectiveDensity: 3,
      effectiveNow: 3,
    });
    expect(mockNavigate).toHaveBeenCalledWith("/board/new-simulation");
    expect(toast.success).toHaveBeenCalledWith("simulationConfig.relaunchSuccessToast");
    expect(result.current.relaunchingRunId).toBeNull();
  });

  it("uses the session's density factor to tell whether the networks will match", async () => {
    sessionWithFactor(0.5);
    vi.mocked(simulationsApi.getConfig).mockResolvedValue(config);
    const { result } = renderHook(() => useRelaunchRun());

    await act(async () => {
      await result.current.relaunch("run-7");
    });

    // density 4 under factor 0.5 → m = 2, not the stored 3
    expect(useSimulationConfigStore.getState().relaunchedFrom?.effectiveNow).toBe(2);
  });

  it("falls back to a factor of 1 without a session", async () => {
    sessionWithFactor(null);
    vi.mocked(simulationsApi.getConfig).mockResolvedValue(config);
    const { result } = renderHook(() => useRelaunchRun());

    await act(async () => {
      await result.current.relaunch("run-7");
    });

    expect(useSimulationConfigStore.getState().relaunchedFrom?.effectiveNow).toBe(4);
  });

  it("exposes the run being fetched while the request is in flight", async () => {
    let resolve: (value: GeneratedRunConfig) => void = () => {};
    vi.mocked(simulationsApi.getConfig).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = renderHook(() => useRelaunchRun());

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.relaunch("run-7");
    });
    expect(result.current.relaunchingRunId).toBe("run-7");

    await act(async () => {
      resolve(config);
      await pending;
    });
    expect(result.current.relaunchingRunId).toBeNull();
  });

  it("logs, toasts and leaves the draft alone when the configuration cannot be loaded", async () => {
    const draftBefore = useSimulationConfigStore.getState().generatedValues;
    vi.mocked(simulationsApi.getConfig).mockRejectedValue(new Error("404"));
    const { result } = renderHook(() => useRelaunchRun());

    await act(async () => {
      await result.current.relaunch("run-c");
    });

    expect(logger.error).toHaveBeenCalledWith("useRelaunchRun", expect.any(Error));
    expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorRelaunch");
    expect(useSimulationConfigStore.getState().generatedValues).toBe(draftBefore);
    expect(useSimulationConfigStore.getState().relaunchedFrom).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.relaunchingRunId).toBeNull();
  });
});
