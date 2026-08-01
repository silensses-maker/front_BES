import { act, renderHook } from "@testing-library/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLastRunStore, useSimulationStore } from "@/entities/simulation";
import { useAuthStore } from "@/entities/user";
import { simulationsApi } from "@/shared/api/backend";
import type { SimCreated } from "@/shared/api/backend/types/backend.types";
import { useTranslation } from "@/shared/i18n";
import { isErrorCode } from "@/shared/lib/backend-error";
import {
  BINARY_THRESHOLD_BYTES,
  encodeCustomSimulation,
  estimateJsonSize,
} from "@/shared/lib/custom-simulation-encoder";
import { logger } from "@/shared/lib/logger";
import type { SimConfigEnvelope } from "@/shared/lib/simulation-export";
import {
  buildEnvelope,
  downloadEnvelopeJson,
  parseEnvelope,
  readJsonFile,
} from "@/shared/lib/simulation-export";
import { useSimulationWsManager } from "@/shared/lib/ws-manager";
import type { CustomSimFormValues, GeneratedSimFormValues } from "../types/simulation-config.types";
import { useSimulationConfigStore } from "./simulation-config.store";
import { useSimulationConfig } from "./use-simulation-config";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

vi.mock("@/shared/lib/ws-manager", () => ({
  useSimulationWsManager: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// Real last-run store (imported by file path to avoid the entity index pulling
// the WS client → backend API → Firebase chain into the test environment).
vi.mock("@/entities/simulation", async () => {
  const { useLastRunStore } = await vi.importActual<
    typeof import("@/entities/simulation/model/last-run.store")
  >("@/entities/simulation/model/last-run.store");
  return { useSimulationStore: vi.fn(), useLastRunStore };
});

vi.mock("@/entities/user", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/shared/api/backend", () => ({
  simulationsApi: {
    startGenerated: vi.fn(),
    startCustom: vi.fn(),
    startCustomBinary: vi.fn(),
  },
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: vi.fn(),
}));

vi.mock("@/shared/lib/backend-error", () => ({
  isErrorCode: vi.fn(),
}));

vi.mock("@/shared/lib/custom-simulation-encoder", () => ({
  estimateJsonSize: vi.fn(),
  encodeCustomSimulation: vi.fn(),
  BINARY_THRESHOLD_BYTES: 512_000,
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("@/shared/lib/simulation-export", () => ({
  buildEnvelope: vi.fn(),
  downloadEnvelopeJson: vi.fn(),
  readJsonFile: vi.fn(),
  parseEnvelope: vi.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockSetRunId = vi.fn();
const mockSetStatus = vi.fn();
const mockPrepareRun = vi.fn();
const mockWsManager = {
  prepareRun: mockPrepareRun,
} as unknown as ReturnType<typeof useSimulationWsManager>;

const mockSimCreated: SimCreated = {
  runId: "run-abc123",
  status: "running",
  networkCount: 1,
  channelId: "ch-1",
  wsTicket: "ticket-1",
  wsUrl: "ws://localhost",
};

/** A valid generated form that passes schema validation.
 * density=2, numberOfAgents=10 → maxEdges = 2*(2-1) + (10-2)*2*2 = 2 + 32 = 34
 */
const validGeneratedValues: GeneratedSimFormValues = {
  networkType: "generated",
  numberOfAgents: 10,
  numberOfNetworks: 1,
  density: 2,
  iterationLimit: 100,
  stopThreshold: 0.01,
  seed: null,
  saveMode: 1,
  agentTypes: [
    { id: "a0", count: 8, silenceStrategy: 0, silenceEffect: 0 },
    { id: "a1", count: 2, silenceStrategy: 0, silenceEffect: 0 },
  ],
  biasTypes: [{ id: "b0", count: 34, cognitiveBias: 0 }],
};

/** A generated form whose iterationLimit exceeds the user limit */
const overLimitGeneratedValues: GeneratedSimFormValues = {
  ...validGeneratedValues,
  iterationLimit: 9999,
};

/** A generated form whose agent count exceeds the user limit */
const overAgentLimitValues: GeneratedSimFormValues = {
  ...validGeneratedValues,
  numberOfAgents: 9999,
  agentTypes: [{ id: "a0", count: 9999, silenceStrategy: 0, silenceEffect: 0 }],
  biasTypes: [{ id: "b0", count: 34, cognitiveBias: 0 }],
};

const alternativeTemplate: GeneratedSimFormValues = {
  networkType: "generated",
  numberOfAgents: 5,
  numberOfNetworks: 2,
  density: 2,
  iterationLimit: 50,
  stopThreshold: 0.05,
  seed: 42,
  saveMode: 0,
  agentTypes: [{ id: "t0", count: 5, silenceStrategy: 1, silenceEffect: 1 }],
  biasTypes: [{ id: "tb0", count: 10, cognitiveBias: 1 }],
};

/** A minimal valid custom form. */
const validCustomValues: CustomSimFormValues = {
  networkType: "custom",
  networkName: "Test Net",
  iterationLimit: 100,
  stopThreshold: 0.01,
  saveMode: 1,
  agents: [
    {
      name: "A",
      belief: 0.5,
      toleranceRadius: 0.3,
      toleranceOffset: 0,
      silenceStrategy: 0,
      silenceEffect: 0,
    },
    {
      name: "B",
      belief: 0.6,
      toleranceRadius: 0.3,
      toleranceOffset: 0,
      silenceStrategy: 0,
      silenceEffect: 0,
    },
  ],
  edges: [{ source: "A", target: "B", influence: 0.5, bias: 0 }],
};

function setupMocks(opts: { maxAgents?: number | null; maxIterations?: number | null } = {}) {
  const { maxAgents = null, maxIterations = null } = opts;

  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useSimulationWsManager).mockReturnValue(mockWsManager);
  vi.mocked(useTranslation).mockReturnValue({
    t: (key: string) => key,
  } as unknown as ReturnType<typeof useTranslation>);
  vi.mocked(useSimulationStore).mockImplementation((selector) =>
    selector({
      setRunId: mockSetRunId,
      setStatus: mockSetStatus,
    } as never),
  );
  vi.mocked(useAuthStore).mockImplementation((selector) =>
    selector({
      user: {
        uid: "uid-1",
        usageLimits: { maxAgents, maxIterations, densityFactor: 1 },
      },
    } as never),
  );
  vi.mocked(isErrorCode).mockReturnValue(false);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSimulationConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    setupMocks();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with step 'network'", () => {
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.step).toBe("network");
    });

    it("starts with loading false", () => {
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.loading).toBe(false);
    });

    it("starts with empty errors object", () => {
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.errors).toEqual({});
    });

    it("starts with usageLimitError null", () => {
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.usageLimitError).toBeNull();
    });

    it("starts with activeTemplate null", () => {
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.activeTemplate).toBeNull();
    });
  });

  // ── updateValues ──────────────────────────────────────────────────────────

  describe("updateValues", () => {
    it("merges a partial patch into the current form values", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ iterationLimit: 500 });
      });

      expect((result.current.values as GeneratedSimFormValues).iterationLimit).toBe(500);
    });

    it("does not overwrite fields that are not in the patch", () => {
      const { result } = renderHook(() => useSimulationConfig());
      const originalNetworks = (result.current.values as GeneratedSimFormValues).numberOfNetworks;

      act(() => {
        result.current.updateValues({ iterationLimit: 500 });
      });

      expect((result.current.values as GeneratedSimFormValues).numberOfNetworks).toBe(
        originalNetworks,
      );
    });

    it("auto-rebalances agentTypes and biasTypes when only numberOfAgents is patched", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ numberOfAgents: 20 });
      });

      const values = result.current.values as GeneratedSimFormValues;
      const agentSum = values.agentTypes.reduce((s, r) => s + r.count, 0);
      const biasSum = values.biasTypes.reduce((s, r) => s + r.count, 0);

      // density stayed at its default (2) — maxEdges(2, 20) = 2*1 + 18*2*2 = 74
      expect(values.numberOfAgents).toBe(20);
      expect(agentSum).toBe(20);
      expect(biasSum).toBe(74);
    });

    it("treats a null numberOfAgents patch as 0 when auto-rebalancing agentTypes (defensive fallback)", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({
          numberOfAgents: null,
        } as unknown as Partial<GeneratedSimFormValues>);
      });

      const values = result.current.values as GeneratedSimFormValues;
      const agentSum = values.agentTypes.reduce((s, r) => s + r.count, 0);

      expect(agentSum).toBe(0);
    });

    it("leaves agentTypes untouched but rebalances biasTypes when only density is patched", () => {
      const { result } = renderHook(() => useSimulationConfig());
      const { result: baseline } = renderHook(() => useSimulationConfig());
      const originalAgentTypes = (baseline.current.values as GeneratedSimFormValues).agentTypes;

      act(() => {
        result.current.updateValues({ density: 5 });
      });

      const values = result.current.values as GeneratedSimFormValues;
      const biasSum = values.biasTypes.reduce((s, r) => s + r.count, 0);

      // numberOfAgents stayed at its default (10) — maxEdges(5, 10) = 5*4 + 5*2*5 = 70
      expect(values.density).toBe(5);
      expect(values.agentTypes).toEqual(originalAgentTypes);
      expect(biasSum).toBe(70);
    });

    it("clears activeTemplate when the user edits a value after applying a template", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });
      expect(result.current.activeTemplate).toBe("polarization");

      act(() => {
        result.current.updateValues({ iterationLimit: 555 });
      });

      expect(result.current.activeTemplate).toBeNull();
    });

    it("does not touch activeTemplate when it is already null", () => {
      const { result } = renderHook(() => useSimulationConfig());

      expect(result.current.activeTemplate).toBeNull();

      act(() => {
        result.current.updateValues({ iterationLimit: 555 });
      });

      expect(result.current.activeTemplate).toBeNull();
    });
  });

  // ── goToStep ──────────────────────────────────────────────────────────────

  describe("goToStep", () => {
    it("sets step to the target value", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.goToStep("agents");
      });

      expect(result.current.step).toBe("agents");
    });

    it("can navigate to review step", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.goToStep("review");
      });

      expect(result.current.step).toBe("review");
    });
  });

  // ── validateAndAdvance ────────────────────────────────────────────────────

  describe("validateAndAdvance", () => {
    describe("generated networkType", () => {
      it("returns true and clears errors when the form is valid", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(true);
        expect(result.current.errors).toEqual({});
      });

      it("returns false and sets iterationLimitExceeded when limit is exceeded", () => {
        setupMocks({ maxIterations: 200 });
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(overLimitGeneratedValues);
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.iterationLimitExceeded).toBe(true);
      });

      it("returns false and sets agentLimitExceeded when agent count exceeds limit", () => {
        setupMocks({ maxAgents: 50 });
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(overAgentLimitValues);
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.agentLimitExceeded).toBe(true);
      });

      it("sets agentCountMismatch when agentTypes counts don't sum to numberOfAgents", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues({
            ...validGeneratedValues,
            numberOfAgents: 10,
            agentTypes: [{ id: "a0", count: 3, silenceStrategy: 0, silenceEffect: 0 }],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.agentCountMismatch).toBe(true);
      });

      it("sets stopThresholdOutOfRange when schema validation catches an out-of-range stopThreshold", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues({
            ...validGeneratedValues,
            stopThreshold: 0,
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.stopThresholdOutOfRange).toBe(true);
      });

      it("sets countsInvalid when a field other than the count/stopThreshold checks fails schema validation", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues({
            ...validGeneratedValues,
            numberOfNetworks: 0,
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.countsInvalid).toBe(true);
      });

      it("returns true immediately without validating when networkType is 'load'", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("load");
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(true);
        expect(result.current.errors).toEqual({});
      });
    });

    describe("custom networkType — step 'network'", () => {
      it("returns true without running schema validation", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            networkName: "My Net",
            iterationLimit: 100,
            stopThreshold: 0.01,
            saveMode: 1,
            agents: [],
            edges: [],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(true);
        expect(result.current.errors).toEqual({});
      });

      it("sets customNetworkNameEmpty when networkName is empty", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            networkName: "  ",
            iterationLimit: 100,
            stopThreshold: 0.01,
            saveMode: 1,
            agents: [],
            edges: [],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.customNetworkNameEmpty).toBe(true);
      });

      it("sets stopThresholdOutOfRange when stopThreshold is 0", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            networkName: "Valid Name",
            iterationLimit: 100,
            stopThreshold: 0,
            saveMode: 1,
            agents: [],
            edges: [],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.stopThresholdOutOfRange).toBe(true);
      });

      it("sets iterationLimitExceeded when limit is exceeded on network step", () => {
        setupMocks({ maxIterations: 50 });
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            networkName: "Valid Name",
            iterationLimit: 9999,
            stopThreshold: 0.01,
            saveMode: 1,
            agents: [],
            edges: [],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.iterationLimitExceeded).toBe(true);
      });
    });

    describe("custom networkType — step 'agents' (full validation)", () => {
      it("returns true when the custom form is valid", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues(validCustomValues);
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(true);
        expect(result.current.errors).toEqual({});
      });

      it("sets customNoAgents when agents array is empty", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            agents: [],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.customNoAgents).toBe(true);
      });

      it("sets customNoEdges when edges array is empty", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            edges: [],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.customNoEdges).toBe(true);
      });

      it("sets customNoAgents when an agent has an empty name (zod path 'agents' catches nested failures)", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            agents: [
              {
                name: "",
                belief: 0.5,
                toleranceRadius: 0.3,
                toleranceOffset: 0,
                silenceStrategy: 0,
                silenceEffect: 0,
              },
              validCustomValues.agents[1]!,
            ],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        // Zod reports path[0] === 'agents' for nested agent field failures,
        // so validateCustomForm maps this to customNoAgents.
        expect(result.current.errors.customNoAgents).toBe(true);
      });

      it("sets customEdgeUnknownAgent when edge references an unknown agent", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            edges: [{ source: "A", target: "GHOST", influence: 0.5, bias: 0 }],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.customEdgeUnknownAgent).toBe(true);
      });

      it("sets customEdgeDuplicate when the same directed edge appears twice", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            edges: [
              { source: "A", target: "B", influence: 0.5, bias: 0 },
              { source: "A", target: "B", influence: 0.3, bias: 0 },
            ],
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.customEdgeDuplicate).toBe(true);
      });

      it("sets customNetworkNameEmpty when schema validation catches an empty networkName at the 'agents' step", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            networkName: "",
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.customNetworkNameEmpty).toBe(true);
      });

      it("sets stopThresholdOutOfRange when schema validation catches an out-of-range stopThreshold at the 'agents' step", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            stopThreshold: 0,
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.stopThresholdOutOfRange).toBe(true);
      });

      it("sets countsInvalid when a scalar field other than networkName/stopThreshold/agents/edges fails schema validation", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            iterationLimit: 0,
          });
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.countsInvalid).toBe(true);
      });
    });
  });

  // ── submit ────────────────────────────────────────────────────────────────

  describe("submit", () => {
    describe("generated network — success", () => {
      it("calls simulationsApi.startGenerated", async () => {
        vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(simulationsApi.startGenerated).toHaveBeenCalledOnce();
      });

      it("calls setRunId and setStatus('running') after success", async () => {
        vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(mockSetRunId).toHaveBeenCalledWith(mockSimCreated.runId);
        expect(mockSetStatus).toHaveBeenCalledWith("running");
      });

      it("registers the run in the last-run store on launch", async () => {
        useLastRunStore.getState().clear();
        vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        const lastRun = useLastRunStore.getState();
        expect(lastRun.runId).toBe(mockSimCreated.runId);
        expect(lastRun.status).toBe("running");
        // Generated runs have no user-facing name
        expect(lastRun.name).toBeNull();
        expect(lastRun.networkCount).toBe(mockSimCreated.networkCount);
      });

      it("navigates to the simulation board route after success", async () => {
        vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(mockNavigate).toHaveBeenCalledWith(`/board/simulation/${mockSimCreated.runId}`);
      });

      it("sets loading false after success", async () => {
        vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(result.current.loading).toBe(false);
      });
    });

    describe("generated network — validation guard", () => {
      it("does not call any API when the form has errors", async () => {
        setupMocks({ maxIterations: 50 });
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(overLimitGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(simulationsApi.startGenerated).not.toHaveBeenCalled();
        expect(simulationsApi.startCustom).not.toHaveBeenCalled();
        expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
      });
    });

    describe("custom network — validation guard", () => {
      it("does not call any API when the custom form has errors", async () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            agents: [],
          });
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(simulationsApi.startGenerated).not.toHaveBeenCalled();
        expect(simulationsApi.startCustom).not.toHaveBeenCalled();
        expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
        expect(result.current.errors.customNoAgents).toBe(true);
      });
    });

    describe("networkType 'load' guard", () => {
      it("shows errorLoadNotReady toast and never calls an API", async () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("load");
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorLoadNotReady");
        expect(simulationsApi.startGenerated).not.toHaveBeenCalled();
        expect(simulationsApi.startCustom).not.toHaveBeenCalled();
        expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
      });
    });

    describe("custom network — small payload", () => {
      it("calls simulationsApi.startCustom when payload is below threshold", async () => {
        vi.mocked(estimateJsonSize).mockReturnValue(BINARY_THRESHOLD_BYTES - 1);
        vi.mocked(simulationsApi.startCustom).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            networkName: "Small Net",
            iterationLimit: 100,
            stopThreshold: 0.01,
            saveMode: 1,
            agents: [
              {
                name: "A",
                belief: 0.5,
                toleranceRadius: 0.3,
                toleranceOffset: 0,
                silenceStrategy: 0,
                silenceEffect: 0,
              },
              {
                name: "B",
                belief: 0.5,
                toleranceRadius: 0.3,
                toleranceOffset: 0,
                silenceStrategy: 0,
                silenceEffect: 0,
              },
            ],
            edges: [{ source: "A", target: "B", influence: 0.5, bias: 0 }],
          });
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(simulationsApi.startCustom).toHaveBeenCalledOnce();
        expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
      });
    });

    describe("custom network — large payload", () => {
      it("calls simulationsApi.startCustomBinary when payload is above threshold", async () => {
        vi.mocked(estimateJsonSize).mockReturnValue(BINARY_THRESHOLD_BYTES + 1);
        vi.mocked(encodeCustomSimulation).mockReturnValue(new ArrayBuffer(8));
        vi.mocked(simulationsApi.startCustomBinary).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            networkName: "Large Net",
            iterationLimit: 200,
            stopThreshold: 0.001,
            saveMode: 1,
            agents: [
              {
                name: "A",
                belief: 0.5,
                toleranceRadius: 0.3,
                toleranceOffset: 0,
                silenceStrategy: 0,
                silenceEffect: 0,
              },
              {
                name: "B",
                belief: 0.5,
                toleranceRadius: 0.3,
                toleranceOffset: 0,
                silenceStrategy: 0,
                silenceEffect: 0,
              },
            ],
            edges: [{ source: "A", target: "B", influence: 0.5, bias: 0 }],
          });
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(simulationsApi.startCustomBinary).toHaveBeenCalledOnce();
        expect(simulationsApi.startCustom).not.toHaveBeenCalled();
      });
    });

    describe("generic error", () => {
      it("logs the error with logger.error", async () => {
        const error = new Error("network fail");
        vi.mocked(simulationsApi.startGenerated).mockRejectedValue(error);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(logger.error).toHaveBeenCalledWith("useSimulationConfig", error);
      });

      it("calls toast.error with the generic submit error key", async () => {
        vi.mocked(simulationsApi.startGenerated).mockRejectedValue(new Error("fail"));
        vi.mocked(isErrorCode).mockReturnValue(false);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorSubmit");
      });

      it("sets loading false in the finally block after error", async () => {
        vi.mocked(simulationsApi.startGenerated).mockRejectedValue(new Error("fail"));
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(result.current.loading).toBe(false);
      });
    });

    describe("usage_limit_exceeded error", () => {
      it("sets usageLimitError with limit and requested from response", async () => {
        const limitError = {
          isAxiosError: true,
          response: {
            data: {
              error: "usage_limit_exceeded",
              message: "Over limit",
              limit: 100,
              requested: 200,
            },
          },
        };
        vi.mocked(simulationsApi.startGenerated).mockRejectedValue(limitError);
        vi.mocked(isErrorCode).mockImplementation((_err, code) => code === "usage_limit_exceeded");
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(result.current.usageLimitError).toEqual({ limit: 100, requested: 200 });
      });

      it("calls toast.error with the limit exceeded translation key", async () => {
        const limitError = {
          isAxiosError: true,
          response: {
            data: {
              error: "usage_limit_exceeded",
              message: "Over limit",
              limit: 100,
              requested: 200,
            },
          },
        };
        vi.mocked(simulationsApi.startGenerated).mockRejectedValue(limitError);
        vi.mocked(isErrorCode).mockImplementation((_err, code) => code === "usage_limit_exceeded");
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorLimitExceeded");
      });

      it("defaults limit and requested to 0 when the error response omits them", async () => {
        const limitError = { isAxiosError: true };
        vi.mocked(simulationsApi.startGenerated).mockRejectedValue(limitError);
        vi.mocked(isErrorCode).mockImplementation((_err, code) => code === "usage_limit_exceeded");
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(result.current.usageLimitError).toEqual({ limit: 0, requested: 0 });
      });
    });
  });

  // ── applyTemplate ─────────────────────────────────────────────────────────

  describe("applyTemplate", () => {
    it("replaces form values with the template", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect((result.current.values as GeneratedSimFormValues).numberOfAgents).toBe(
        alternativeTemplate.numberOfAgents,
      );
    });

    it("sets activeTemplate to the given key", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect(result.current.activeTemplate).toBe("polarization");
    });

    it("clears existing errors", () => {
      setupMocks({ maxIterations: 50 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(overLimitGeneratedValues);
        result.current.validateAndAdvance();
      });
      expect(result.current.errors.iterationLimitExceeded).toBe(true);

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect(result.current.errors).toEqual({});
    });

    it("clears usageLimitError", async () => {
      const limitError = {
        isAxiosError: true,
        response: {
          data: {
            error: "usage_limit_exceeded",
            message: "Over limit",
            limit: 100,
            requested: 200,
          },
        },
      };
      vi.mocked(simulationsApi.startGenerated).mockRejectedValue(limitError);
      vi.mocked(isErrorCode).mockImplementation((_err, code) => code === "usage_limit_exceeded");
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(validGeneratedValues);
      });
      await act(async () => {
        await result.current.submit();
      });
      expect(result.current.usageLimitError).not.toBeNull();

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect(result.current.usageLimitError).toBeNull();
    });
  });

  // ── exportConfig ──────────────────────────────────────────────────────────

  describe("exportConfig", () => {
    it("calls buildEnvelope with the current form values", () => {
      const mockEnvelope: SimConfigEnvelope = {
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: { networkType: "generated" },
      };
      vi.mocked(buildEnvelope).mockReturnValue(mockEnvelope);

      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(validGeneratedValues);
      });

      act(() => {
        result.current.exportConfig();
      });

      expect(buildEnvelope).toHaveBeenCalledOnce();
    });

    it("calls downloadEnvelopeJson with the envelope and networkType", () => {
      const mockEnvelope: SimConfigEnvelope = {
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: { networkType: "generated" },
      };
      vi.mocked(buildEnvelope).mockReturnValue(mockEnvelope);

      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(validGeneratedValues);
      });

      act(() => {
        result.current.exportConfig();
      });

      expect(downloadEnvelopeJson).toHaveBeenCalledWith(mockEnvelope, "generated");
    });

    it("passes networkType='custom' when in custom mode", () => {
      const mockEnvelope: SimConfigEnvelope = {
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: { networkType: "custom" },
      };
      vi.mocked(buildEnvelope).mockReturnValue(mockEnvelope);

      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
        result.current.updateValues(validCustomValues);
      });

      act(() => {
        result.current.exportConfig();
      });

      expect(downloadEnvelopeJson).toHaveBeenCalledWith(mockEnvelope, "custom");
    });
  });

  // ── handleImportFile ──────────────────────────────────────────────────────

  describe("handleImportFile", () => {
    const dummyFile = new File(["{}"], "config.json", { type: "application/json" });

    it("shows errorImportInvalid toast when readJsonFile rejects", async () => {
      vi.mocked(readJsonFile).mockRejectedValue(new SyntaxError("bad json"));

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(logger.error).toHaveBeenCalledWith(
        "useSimulationConfig.handleImportFile",
        expect.any(SyntaxError),
      );
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorImportInvalid");
    });

    it("sets importInvalid error and toasts when parseEnvelope returns null", async () => {
      vi.mocked(readJsonFile).mockResolvedValue({ someUnknown: true });
      vi.mocked(parseEnvelope).mockReturnValue(null);

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.errors.importInvalid).toBe(true);
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorImportInvalid");
    });

    it("sets importInvalid error when networkType is unknown", async () => {
      vi.mocked(readJsonFile).mockResolvedValue({ networkType: "unknown-type" });
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: { networkType: "unknown-type" },
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.errors.importInvalid).toBe(true);
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorImportInvalid");
    });

    it("loads a valid generated envelope into the store and clears errors", async () => {
      vi.mocked(readJsonFile).mockResolvedValue(validGeneratedValues);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: validGeneratedValues as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.networkType).toBe("generated");
      expect(result.current.errors).toEqual({});
      expect(result.current.usageLimitError).toBeNull();
      expect((result.current.values as GeneratedSimFormValues).numberOfAgents).toBe(
        validGeneratedValues.numberOfAgents,
      );
    });

    it("loads a valid custom envelope into the store", async () => {
      vi.mocked(readJsonFile).mockResolvedValue(validCustomValues);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: validCustomValues as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.networkType).toBe("custom");
      expect(result.current.errors).toEqual({});
      expect((result.current.values as CustomSimFormValues).networkName).toBe(
        validCustomValues.networkName,
      );
    });

    it("surfaces agentLimitExceeded after importing generated values that exceed user limit", async () => {
      setupMocks({ maxAgents: 5 });

      vi.mocked(readJsonFile).mockResolvedValue(validGeneratedValues);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: validGeneratedValues as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      // validGeneratedValues has numberOfAgents=10, limit is 5
      expect(result.current.errors.agentLimitExceeded).toBe(true);
    });

    it("surfaces iterationLimitExceeded after importing generated values that exceed iteration limit", async () => {
      setupMocks({ maxIterations: 50 });

      vi.mocked(readJsonFile).mockResolvedValue(validGeneratedValues);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: validGeneratedValues as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      // validGeneratedValues has iterationLimit=100, limit is 50
      expect(result.current.errors.iterationLimitExceeded).toBe(true);
    });

    it("surfaces iterationLimitExceeded after importing custom values that exceed iteration limit", async () => {
      setupMocks({ maxIterations: 50 });

      vi.mocked(readJsonFile).mockResolvedValue(validCustomValues);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: validCustomValues as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      // validCustomValues has iterationLimit=100, limit is 50
      expect(result.current.errors.iterationLimitExceeded).toBe(true);
    });

    it("sets importInvalid and toasts when imported generated payload fails schema", async () => {
      const badGeneratedPayload = { networkType: "generated", numberOfAgents: "not-a-number" };
      vi.mocked(readJsonFile).mockResolvedValue(badGeneratedPayload);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: badGeneratedPayload as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.errors.importInvalid).toBe(true);
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.importError");
    });

    it("sets importInvalid and toasts when imported custom payload fails schema", async () => {
      const badCustomPayload = { networkType: "custom", networkName: "" };
      vi.mocked(readJsonFile).mockResolvedValue(badCustomPayload);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: badCustomPayload as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.errors.importInvalid).toBe(true);
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.importError");
    });
  });

  // ── loadFileAndAdvance ────────────────────────────────────────────────────

  describe("loadFileAndAdvance", () => {
    const dummyFile = new File(["{}"], "config.json", { type: "application/json" });

    it("advances the step to 'agents' after a successful import", async () => {
      vi.mocked(readJsonFile).mockResolvedValue(validGeneratedValues);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: validGeneratedValues as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.loadFileAndAdvance(dummyFile);
      });

      expect(result.current.networkType).toBe("generated");
      expect(result.current.step).toBe("agents");
    });

    it("does not advance the step when the import fails and networkType stays 'load'", async () => {
      vi.mocked(readJsonFile).mockRejectedValue(new SyntaxError("bad json"));

      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("load");
      });
      expect(result.current.step).toBe("load");

      await act(async () => {
        await result.current.loadFileAndAdvance(dummyFile);
      });

      expect(result.current.networkType).toBe("load");
      expect(result.current.step).toBe("load");
    });
  });
});
