import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSimulationWsClient, useSimulationStore } from "@/entities/simulation";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { isErrorCode } from "@/shared/lib/backend-error";
import { logger } from "@/shared/lib/logger";
import { useSimulationStream } from "./use-simulation-stream";

// ─── Module mocks ────────────────────────────────────────────────────────────

// Hoisted refs so vi.mock factory (which is hoisted) can reference them.
const { mockSetTopology, mockGetState, mockManager } = vi.hoisted(() => ({
  mockSetTopology: vi.fn(),
  mockGetState: vi.fn(),
  // Stable reference: the real provider returns a singleton via useMemo, so the
  // mock must too. Returning a fresh object per render would make `manager`
  // change identity every render, re-firing the hook's effect (manager is in
  // its deps) → setIsConnecting → re-render → infinite loop.
  mockManager: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    prepareRun: vi.fn(),
  },
}));

vi.mock("@/app/providers/simulation-ws-provider", () => ({
  useSimulationWsManager: vi.fn(() => mockManager),
}));

vi.mock("@/entities/simulation", () => {
  const useSimulationStoreMock = vi.fn() as unknown as ReturnType<typeof vi.fn> & {
    getState: typeof mockGetState;
  };
  useSimulationStoreMock.getState = mockGetState;
  return {
    createSimulationWsClient: vi.fn(),
    useSimulationStore: useSimulationStoreMock,
  };
});

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    getTopology: vi.fn(),
    getTopologyFull: vi.fn(),
  },
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: vi.fn(),
}));

vi.mock("@/shared/lib/backend-error", () => ({
  isErrorCode: vi.fn(),
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// ─── Types ───────────────────────────────────────────────────────────────────

type MockWsClient = {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type MockStoreState = {
  status: string;
  topology: null;
  currentRound: number;
  error: null;
  reset: ReturnType<typeof vi.fn>;
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockReset = vi.fn();

const mockStoreState: MockStoreState = {
  status: "idle",
  topology: null,
  currentRound: 0,
  error: null,
  reset: mockReset,
};

function makeMockClient(): MockWsClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSimulationStream", () => {
  let mockClient: MockWsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = makeMockClient();
    vi.mocked(createSimulationWsClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof createSimulationWsClient>,
    );
    vi.mocked(useSimulationStore).mockImplementation((selector) =>
      selector(mockStoreState as never),
    );
    // Set up getState() static for the proactive topology-fetch path.
    mockGetState.mockReturnValue({
      topology: null,
      setTopology: mockSetTopology,
    });
    vi.mocked(simulationsApi.getTopologyFull).mockResolvedValue(null);
    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string) => key,
    } as unknown as ReturnType<typeof useTranslation>);
    vi.mocked(isErrorCode).mockReturnValue(false);
  });

  describe("initialization", () => {
    it("calls reset() on mount", async () => {
      await act(async () => {
        renderHook(() => useSimulationStream("run-123"));
      });

      expect(mockReset).toHaveBeenCalledOnce();
    });

    it("creates a SimulationWsClient with the provided runId", async () => {
      await act(async () => {
        renderHook(() => useSimulationStream("run-abc"));
      });

      expect(createSimulationWsClient).toHaveBeenCalledWith("run-abc", null, mockManager);
    });

    it("calls client.connect() after creating the client", async () => {
      await act(async () => {
        renderHook(() => useSimulationStream("run-123"));
      });

      expect(mockClient.connect).toHaveBeenCalledOnce();
    });

    it("returns status, topology, currentRound, error, and isConnecting", async () => {
      const { result } = renderHook(() => useSimulationStream("run-123"));

      await act(async () => {});

      expect(result.current).toMatchObject({
        status: "idle",
        topology: null,
        currentRound: 0,
        error: null,
        isConnecting: expect.any(Boolean),
      });
    });
  });

  describe("connect() failure — rate_limited", () => {
    it("logs the error with logger.error", async () => {
      const connectError = new Error("rate limited");
      mockClient.connect.mockRejectedValue(connectError);
      vi.mocked(isErrorCode).mockImplementation((_err, code) => code === "rate_limited");

      await act(async () => {
        renderHook(() => useSimulationStream("run-123"));
      });

      expect(logger.error).toHaveBeenCalledWith("useSimulationStream", connectError);
    });

    it("calls toast.error with simulation.errorRateLimited translation key", async () => {
      const connectError = new Error("rate limited");
      mockClient.connect.mockRejectedValue(connectError);
      vi.mocked(isErrorCode).mockImplementation((_err, code) => code === "rate_limited");

      await act(async () => {
        renderHook(() => useSimulationStream("run-123"));
      });

      expect(toast.error).toHaveBeenCalledWith("simulation.errorRateLimited");
    });

    it("sets isConnecting to false after error", async () => {
      mockClient.connect.mockRejectedValue(new Error("rate limited"));
      vi.mocked(isErrorCode).mockReturnValue(true);

      const { result } = renderHook(() => useSimulationStream("run-123"));

      await act(async () => {});

      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe("connect() failure — forbidden", () => {
    it("calls toast.error with simulation.errorForbidden translation key", async () => {
      const connectError = new Error("forbidden");
      mockClient.connect.mockRejectedValue(connectError);
      vi.mocked(isErrorCode).mockImplementation((_err, code) => code === "forbidden");

      await act(async () => {
        renderHook(() => useSimulationStream("run-123"));
      });

      expect(toast.error).toHaveBeenCalledWith("simulation.errorForbidden");
    });
  });

  describe("connect() failure — generic error", () => {
    it("calls toast.error with simulation.errorStream when no specific code matches", async () => {
      mockClient.connect.mockRejectedValue(new Error("unknown error"));
      vi.mocked(isErrorCode).mockReturnValue(false);

      await act(async () => {
        renderHook(() => useSimulationStream("run-123"));
      });

      expect(toast.error).toHaveBeenCalledWith("simulation.errorStream");
    });
  });

  describe("cleanup on unmount", () => {
    it("calls client.disconnect() when the component unmounts", async () => {
      const { unmount } = renderHook(() => useSimulationStream("run-123"));

      await act(async () => {});

      act(() => {
        unmount();
      });

      expect(mockClient.disconnect).toHaveBeenCalledOnce();
    });
  });
});
