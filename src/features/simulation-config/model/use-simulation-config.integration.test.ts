import { act, renderHook } from "@testing-library/react";
import { useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSimulationStore } from "@/entities/simulation";
import { useAuthStore } from "@/entities/user";
import { simulationsApi } from "@/shared/api/backend";
import type { SimCreated } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { isErrorCode } from "@/shared/lib/backend-error";
import { BINARY_THRESHOLD_BYTES } from "@/shared/lib/custom-simulation-encoder";
import { useSimulationConfigStore } from "./simulation-config.store";
import { useSimulationConfig } from "./use-simulation-config";

// ─── Module mocks — encoder intentionally NOT mocked ─────────────────────────

vi.mock("react-router-dom", () => ({ useNavigate: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/shared/lib/ws-manager", () => ({
  useSimulationWsManager: vi.fn(() => ({ prepareRun: vi.fn() })),
}));
// Real last-run store (imported by file path to avoid the entity index pulling
// the WS client → backend API → Firebase chain into the test environment).
vi.mock("@/entities/simulation", async () => {
  const { useLastRunStore } = await vi.importActual<
    typeof import("@/entities/simulation/model/last-run.store")
  >("@/entities/simulation/model/last-run.store");
  return { useSimulationStore: vi.fn(), useLastRunStore };
});
vi.mock("@/entities/user", () => ({ useAuthStore: vi.fn() }));
vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    startGenerated: vi.fn(),
    startCustom: vi.fn(),
    startCustomBinary: vi.fn(),
  },
}));
vi.mock("@/shared/i18n", () => ({ useTranslation: vi.fn() }));
vi.mock("@/shared/lib/backend-error", () => ({ isErrorCode: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({ logger: { error: vi.fn() } }));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockSetRunId = vi.fn();
const mockSetStatus = vi.fn();

const mockSimCreated: SimCreated = {
  runId: "run-integration",
  status: "running",
  networkCount: 1,
  channelId: "ch-1",
  wsTicket: "ticket-1",
  wsUrl: "ws://localhost",
};

// 5120 × 100 + 1 × 50 = 512,050 — crosses BINARY_THRESHOLD_BYTES (512,000)
const LARGE_AGENTS = Array.from({ length: 5120 }, (_, i) => ({
  name: `Agent${i}`,
  belief: 0.5,
  toleranceRadius: 0.3,
  toleranceOffset: 0.0,
  silenceStrategy: 0 as const,
  silenceEffect: 0 as const,
}));

const LARGE_EDGES = [{ source: "Agent0", target: "Agent1", influence: 0.5, bias: 0 as const }];

// 2 × 100 + 1 × 50 = 250 — well below threshold
const SMALL_AGENTS = [
  {
    name: "A",
    belief: 0.5,
    toleranceRadius: 0.3,
    toleranceOffset: 0.0,
    silenceStrategy: 0 as const,
    silenceEffect: 0 as const,
  },
  {
    name: "B",
    belief: 0.5,
    toleranceRadius: 0.3,
    toleranceOffset: 0.0,
    silenceStrategy: 0 as const,
    silenceEffect: 0 as const,
  },
];

const SMALL_EDGES = [{ source: "A", target: "B", influence: 0.5, bias: 0 as const }];

function setupMocks() {
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useTranslation).mockReturnValue({
    t: (key: string) => key,
  } as unknown as ReturnType<typeof useTranslation>);
  vi.mocked(useSimulationStore).mockImplementation((selector) =>
    selector({ setRunId: mockSetRunId, setStatus: mockSetStatus } as never),
  );
  vi.mocked(useAuthStore).mockImplementation((selector) =>
    selector({
      user: {
        uid: "uid-1",
        usageLimits: { maxAgents: null, maxIterations: null, densityFactor: 1 },
      },
    } as never),
  );
  vi.mocked(isErrorCode).mockReturnValue(false);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSimulationConfig — encoder integration (real estimateJsonSize + encodeCustomSimulation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    setupMocks();
  });

  describe(`large payload (> ${BINARY_THRESHOLD_BYTES} bytes estimated)`, () => {
    it("routes to startCustomBinary and not startCustom", async () => {
      vi.mocked(simulationsApi.startCustomBinary).mockResolvedValue(mockSimCreated);
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
      });
      act(() => {
        result.current.updateValues({
          networkName: "LargeNet",
          iterationLimit: 100,
          stopThreshold: 0.01,
          saveMode: 1,
          agents: LARGE_AGENTS,
          edges: LARGE_EDGES,
        });
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(simulationsApi.startCustomBinary).toHaveBeenCalledOnce();
      expect(simulationsApi.startCustom).not.toHaveBeenCalled();
    });

    it("passes a non-empty ArrayBuffer produced by the real encoder", async () => {
      vi.mocked(simulationsApi.startCustomBinary).mockResolvedValue(mockSimCreated);
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
      });
      act(() => {
        result.current.updateValues({
          networkName: "LargeNet",
          iterationLimit: 100,
          stopThreshold: 0.01,
          saveMode: 1,
          agents: LARGE_AGENTS,
          edges: LARGE_EDGES,
        });
      });

      await act(async () => {
        await result.current.submit();
      });

      const [buffer] = vi.mocked(simulationsApi.startCustomBinary).mock.calls[0]!;
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect((buffer as ArrayBuffer).byteLength).toBeGreaterThan(0);
    });
  });

  describe("small payload (below threshold)", () => {
    it("routes to startCustom (JSON) and not startCustomBinary", async () => {
      vi.mocked(simulationsApi.startCustom).mockResolvedValue(mockSimCreated);
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
      });
      act(() => {
        result.current.updateValues({
          networkName: "SmallNet",
          iterationLimit: 100,
          stopThreshold: 0.01,
          saveMode: 1,
          agents: SMALL_AGENTS,
          edges: SMALL_EDGES,
        });
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(simulationsApi.startCustom).toHaveBeenCalledOnce();
      expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
    });
  });
});
