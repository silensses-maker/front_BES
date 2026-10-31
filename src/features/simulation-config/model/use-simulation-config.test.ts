import { act, renderHook } from "@testing-library/react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLastRunStore, useLaunchedConfigStore, useSimulationStore } from "@/entities/simulation";
import type { UserRole } from "@/entities/user";
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
import { RUN_SAVE_MODE } from "../lib/templates";
import type {
  AgentTypeRow,
  CustomSimFormValues,
  GeneratedSimFormValues,
} from "../types/simulation-config.types";
import {
  DEFAULT_CUSTOM_FORM,
  DEFAULT_FORM,
  useSimulationConfigStore,
} from "./simulation-config.store";
import { useSimulationConfig } from "./use-simulation-config";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

vi.mock("@/shared/lib/ws-manager", () => ({
  useSimulationWsManager: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// Real last-run store (imported by file path to avoid the entity index pulling
// the WS client → backend API → Firebase chain into the test environment).
vi.mock("@/entities/simulation", async () => {
  const { useLastRunStore } = await vi.importActual<
    typeof import("@/entities/simulation/model/last-run.store")
  >("@/entities/simulation/model/last-run.store");
  const { useLaunchedConfigStore } = await vi.importActual<
    typeof import("@/entities/simulation/model/launched-config.store")
  >("@/entities/simulation/model/launched-config.store");
  return { useSimulationStore: vi.fn(), useLastRunStore, useLaunchedConfigStore };
});

// Real (pure) role-table fallback, imported by file path so the entity index does not pull
// the Firebase-backed auth store into the test environment.
vi.mock("@/entities/user", async () => {
  const { getHighestRole, resolveMaxNetworks } = await vi.importActual<
    typeof import("@/entities/user/lib/permissions")
  >("@/entities/user/lib/permissions");
  return { useAuthStore: vi.fn(), getHighestRole, resolveMaxNetworks };
});

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

function setupMocks(
  opts: {
    maxAgents?: number | null;
    maxIterations?: number | null;
    /** Omitted → the session predates #122 and the role table applies. */
    maxNetworks?: number;
    roles?: UserRole[];
  } = {},
) {
  const { maxAgents = null, maxIterations = null, maxNetworks, roles } = opts;

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
        ...(roles === undefined ? {} : { roles }),
        usageLimits: {
          maxAgents,
          maxIterations,
          densityFactor: 1,
          ...(maxNetworks === undefined ? {} : { maxNetworks }),
        },
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

  // ── Drafts over the iteration quota ───────────────────────────────────────

  describe("drafts over the iteration quota", () => {
    it("caps the default drafts once the quota is known (Guest: 10)", () => {
      setupMocks({ maxIterations: 10 });
      renderHook(() => useSimulationConfig());
      const { generatedValues, customValues } = useSimulationConfigStore.getState();
      expect(generatedValues.iterationLimit).toBe(10);
      expect(customValues.iterationLimit).toBe(10);
    });

    it("leaves the defaults as they are without a cap", () => {
      renderHook(() => useSimulationConfig());
      const { generatedValues, customValues } = useSimulationConfigStore.getState();
      expect(generatedValues.iterationLimit).toBe(DEFAULT_FORM.iterationLimit);
      expect(customValues.iterationLimit).toBe(DEFAULT_CUSTOM_FORM.iterationLimit);
    });

    it("caps again when the quota changes", () => {
      setupMocks({ maxIterations: 100 });
      const { rerender } = renderHook(() => useSimulationConfig());
      expect(useSimulationConfigStore.getState().customValues.iterationLimit).toBe(100);

      setupMocks({ maxIterations: 20 });
      rerender();

      const { generatedValues, customValues } = useSimulationConfigStore.getState();
      expect(generatedValues.iterationLimit).toBe(20);
      expect(customValues.iterationLimit).toBe(20);
    });

    it("keeps a value typed above the cap, for the field error to report", () => {
      setupMocks({ maxIterations: 50 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ iterationLimit: 80 });
      });

      expect(useSimulationConfigStore.getState().generatedValues.iterationLimit).toBe(80);
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

      it("sets agentCountMismatch on the Agents step when agentTypes counts don't sum to numberOfAgents", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues({
            ...validGeneratedValues,
            numberOfAgents: 10,
            agentTypes: [{ id: "a0", count: 3, silenceStrategy: 0, silenceEffect: 0 }],
          });
          result.current.goToStep("agents");
        });

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(false);
        expect(result.current.errors.agentCountMismatch).toBe(true);
      });

      it("the Network step's Next ignores the agent and bias rows: they belong to the Agents step", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues({
            ...validGeneratedValues,
            numberOfAgents: 10,
            agentTypes: [{ id: "a0", count: 3, silenceStrategy: 0, silenceEffect: 0 }],
            biasTypes: [{ id: "b0", count: 1, cognitiveBias: 0 }],
          });
        });
        expect(result.current.step).toBe("network");

        let valid = false;
        act(() => {
          valid = result.current.validateAndAdvance();
        });

        expect(valid).toBe(true);
        expect(result.current.errors).toEqual({});
      });

      it("going to another step drops the errors of the step that produced them", () => {
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues({
            ...validGeneratedValues,
            numberOfAgents: 10,
            agentTypes: [{ id: "a0", count: 3, silenceStrategy: 0, silenceEffect: 0 }],
          });
          result.current.goToStep("agents");
        });
        act(() => {
          result.current.validateAndAdvance();
        });
        expect(result.current.errors.agentCountMismatch).toBe(true);

        act(() => {
          result.current.goToStep("network");
        });

        expect(result.current.step).toBe("network");
        expect(result.current.errors).toEqual({});
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

      it("sets customAgentInvalid, not customNoAgents, when an agent has an empty name", () => {
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
        // The issue path is ["agents", 0, "name"]: a field inside an agent, not an empty list.
        expect(result.current.errors.customAgentInvalid).toBe(true);
        expect(result.current.errors.customNoAgents).toBeUndefined();
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

      it("keeps the launched configuration for the run detail export (#127)", async () => {
        useLaunchedConfigStore.getState().clear();
        vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        const launched = useLaunchedConfigStore.getState();
        expect(launched.runId).toBe(mockSimCreated.runId);
        // The wizard values as launched — the draft itself is reset afterwards
        expect(launched.config).toEqual(validGeneratedValues);
        expect(useSimulationConfigStore.getState().generatedValues).not.toEqual(
          validGeneratedValues,
        );
      });

      it("does not record a configuration when the launch fails", async () => {
        useLaunchedConfigStore.getState().clear();
        vi.mocked(simulationsApi.startGenerated).mockRejectedValue(new Error("boom"));
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.updateValues(validGeneratedValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(useLaunchedConfigStore.getState().runId).toBeNull();
        expect(useLaunchedConfigStore.getState().config).toBeNull();
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

    describe("generated network — request body (#120)", () => {
      it("sends only silenceStrategy/silenceEffect/count per agent type, full enum range, no threshold/confidence", async () => {
        vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        // A stale row (e.g. from an old draft) still carrying the removed fields.
        const staleRow = {
          id: "a1",
          count: 2,
          silenceStrategy: 3,
          silenceEffect: 2,
          majorityThreshold: 0.4,
          confidence: 0.9,
        } as AgentTypeRow;

        act(() => {
          result.current.updateValues({
            ...validGeneratedValues,
            agentTypes: [{ id: "a0", count: 8, silenceStrategy: 2, silenceEffect: 1 }, staleRow],
            biasTypes: [{ id: "b0", count: 34, cognitiveBias: 4 }],
          });
        });

        await act(async () => {
          await result.current.submit();
        });

        expect(simulationsApi.startGenerated).toHaveBeenCalledOnce();
        const body = vi.mocked(simulationsApi.startGenerated).mock.calls[0]?.[0];
        expect(body?.agentTypes).toEqual([
          { silenceStrategy: 2, silenceEffect: 1, count: 8 },
          { silenceStrategy: 3, silenceEffect: 2, count: 2 },
        ]);
        expect(body?.biasTypes).toEqual([{ biasType: 4, count: 34 }]);
        for (const agentType of body?.agentTypes ?? []) {
          expect(agentType).not.toHaveProperty("majorityThreshold");
          expect(agentType).not.toHaveProperty("confidence");
        }
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

      it("keeps the launched custom configuration with its runId (#127)", async () => {
        useLaunchedConfigStore.getState().clear();
        vi.mocked(estimateJsonSize).mockReturnValue(BINARY_THRESHOLD_BYTES - 1);
        vi.mocked(simulationsApi.startCustom).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues(validCustomValues);
        });

        await act(async () => {
          await result.current.submit();
        });

        const launched = useLaunchedConfigStore.getState();
        expect(launched.runId).toBe(mockSimCreated.runId);
        expect(launched.config).toEqual(validCustomValues);
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

      it("passes the full canonical enums to the encoder unchanged (#120)", async () => {
        vi.mocked(estimateJsonSize).mockReturnValue(BINARY_THRESHOLD_BYTES + 1);
        vi.mocked(encodeCustomSimulation).mockReturnValue(new ArrayBuffer(8));
        vi.mocked(simulationsApi.startCustomBinary).mockResolvedValue(mockSimCreated);
        const { result } = renderHook(() => useSimulationConfig());

        act(() => {
          result.current.setNetworkType("custom");
        });
        act(() => {
          result.current.updateValues({
            ...validCustomValues,
            agents: [
              { ...validCustomValues.agents[0]!, silenceStrategy: 3, silenceEffect: 2 },
              { ...validCustomValues.agents[1]!, silenceStrategy: 2, silenceEffect: 1 },
            ],
            edges: [{ source: "A", target: "B", influence: 0.5, bias: 4 }],
          });
        });

        await act(async () => {
          await result.current.submit();
        });

        const params = vi.mocked(encodeCustomSimulation).mock.calls[0]?.[0];
        expect(params?.agents.map((a) => [a.silenceStrategy, a.silenceEffect])).toEqual([
          [3, 2],
          [2, 1],
        ]);
        expect(params?.edges.map((e) => e.bias)).toEqual([4]);
        for (const agent of params?.agents ?? []) {
          expect(agent).not.toHaveProperty("majorityThreshold");
          expect(agent).not.toHaveProperty("confidence");
        }
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

    it("keeps a template that fits the quota and confirms it", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect((result.current.values as GeneratedSimFormValues).iterationLimit).toBe(
        alternativeTemplate.iterationLimit,
      );
      expect(toast.success).toHaveBeenCalledWith("simulationConfig.templateAppliedToast");
    });

    it("caps the template's iteration limit at the quota and says so", () => {
      setupMocks({ maxIterations: 10 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect((result.current.values as GeneratedSimFormValues).iterationLimit).toBe(10);
      expect(result.current.activeTemplate).toBe("polarization");
      expect(toast.success).toHaveBeenCalledWith("simulationConfig.templateAppliedCappedToast");
    });

    it("sets activeTemplate to the given key", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect(result.current.activeTemplate).toBe("polarization");
    });

    it("drops the re-launch note of a draft pre-filled from a past run (#127)", () => {
      useSimulationConfigStore.getState().applyRelaunch(validGeneratedValues, {
        runId: "run-1",
        seed: "42",
        seedKept: true,
        densityExact: true,
        effectiveDensity: 2,
        effectiveNow: 2,
      });
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.relaunchedFrom?.runId).toBe("run-1");

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect(result.current.relaunchedFrom).toBeNull();
    });

    it("clears existing errors", () => {
      setupMocks({ maxIterations: 50 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(overLimitGeneratedValues);
      });
      act(() => {
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

    it("accepts a legacy generated file with majorityThreshold / confidence and ignores them (#120)", async () => {
      const legacyPayload = {
        ...validGeneratedValues,
        agentTypes: [
          { id: "a0", count: 8, silenceStrategy: 2, silenceEffect: 1, majorityThreshold: 0.4 },
          { id: "a1", count: 2, silenceStrategy: 3, silenceEffect: 2, confidence: 0.9 },
        ],
      };
      vi.mocked(readJsonFile).mockResolvedValue(legacyPayload);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: legacyPayload as unknown as Record<string, unknown>,
      });

      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.errors).toEqual({});
      expect(toast.error).not.toHaveBeenCalled();
      const rows = (result.current.values as GeneratedSimFormValues).agentTypes;
      expect(rows).toEqual([
        { id: "a0", count: 8, silenceStrategy: 2, silenceEffect: 1 },
        { id: "a1", count: 2, silenceStrategy: 3, silenceEffect: 2 },
      ]);
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

  // ── #110 additions: resetDraft, toasts, loadedFromFile ────────────────────

  describe("resetDraft", () => {
    it("resets the store to defaults and fires the discard toast", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ numberOfAgents: 500 });
      });
      act(() => {
        result.current.resetDraft();
      });

      expect(useSimulationConfigStore.getState().generatedValues.numberOfAgents).toBe(10);
      expect(toast.success).toHaveBeenCalledWith("simulationConfig.discardSuccessToast");
      expect(result.current.errors).toEqual({});
      expect(result.current.usageLimitError).toBeNull();
    });

    it("caps the restored defaults at the quota", () => {
      setupMocks({ maxIterations: 10 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ iterationLimit: 5 });
      });
      act(() => {
        result.current.resetDraft();
      });

      const { generatedValues, customValues } = useSimulationConfigStore.getState();
      expect(generatedValues.iterationLimit).toBe(10);
      expect(customValues.iterationLimit).toBe(10);
    });
  });

  describe("wizard toasts (#110)", () => {
    it("validateAndAdvance fires nextInvalidToast on failure", () => {
      setupMocks({ maxAgents: 5 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(overAgentLimitValues);
      });
      let advanced = true;
      act(() => {
        advanced = result.current.validateAndAdvance();
      });

      expect(advanced).toBe(false);
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.nextInvalidToast");
    });

    it("submit with invalid values fires launchInvalidToast", async () => {
      setupMocks({ maxAgents: 5 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(overAgentLimitValues);
      });
      await act(async () => {
        await result.current.submit();
      });

      expect(toast.error).toHaveBeenCalledWith("simulationConfig.launchInvalidToast");
      expect(simulationsApi.startGenerated).not.toHaveBeenCalled();
    });

    it("successful submit fires launchSuccessToast", async () => {
      vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues(validGeneratedValues);
      });
      await act(async () => {
        await result.current.submit();
      });

      expect(toast.success).toHaveBeenCalledWith("simulationConfig.launchSuccessToast");
    });

    it("applyTemplate fires templateAppliedToast with the resolved name", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.applyTemplate("polarization", alternativeTemplate);
      });

      expect(toast.success).toHaveBeenCalledWith("simulationConfig.templateAppliedToast");
    });

    it("exportConfig fires exportSuccessToast", () => {
      vi.mocked(buildEnvelope).mockReturnValue({} as SimConfigEnvelope);
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.exportConfig();
      });

      expect(toast.success).toHaveBeenCalledWith("simulationConfig.exportSuccessToast");
    });
  });

  describe("persisted v0 drafts (#120)", () => {
    it("rehydrates a draft whose rows still carry majorityThreshold / confidence without them", async () => {
      const legacyState = {
        ...useSimulationConfigStore.getState(),
        step: "agents",
        generatedValues: {
          ...validGeneratedValues,
          agentTypes: [
            { id: "a0", count: 8, silenceStrategy: 2, silenceEffect: 1, majorityThreshold: 0.4 },
            { id: "a1", count: 2, silenceStrategy: 3, silenceEffect: 0, confidence: 0.5 },
          ],
        },
      };
      localStorage.setItem(
        "bes-simulation-config",
        JSON.stringify({ state: legacyState, version: 0 }),
      );

      await useSimulationConfigStore.persist.rehydrate();

      const state = useSimulationConfigStore.getState();
      expect(state.step).toBe("agents");
      expect(state.generatedValues.agentTypes).toEqual([
        { id: "a0", count: 8, silenceStrategy: 2, silenceEffect: 1 },
        { id: "a1", count: 2, silenceStrategy: 3, silenceEffect: 0 },
      ]);
      localStorage.removeItem("bes-simulation-config");
    });
  });

  describe("loadedFromFile (#110)", () => {
    it("is false by default and exposed by the hook", () => {
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.loadedFromFile).toBe(false);
    });

    it("is cleared by setNetworkType", () => {
      useSimulationConfigStore.getState().setLoadedFromFile(true);
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
      });

      expect(useSimulationConfigStore.getState().loadedFromFile).toBe(false);
    });
  });
});

// ─── Role quotas (#122) ──────────────────────────────────────────────────────

function makeCustomAgents(count: number): CustomSimFormValues["agents"] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Agent${i}`,
    belief: 0.5,
    toleranceRadius: 0.3,
    toleranceOffset: 0,
    silenceStrategy: 0 as const,
    silenceEffect: 0 as const,
  }));
}

/** validCustomValues with `count` agents (the single edge still references two of them). */
function customWithAgents(count: number): CustomSimFormValues {
  return {
    ...validCustomValues,
    agents: makeCustomAgents(count),
    edges: [{ source: "Agent0", target: "Agent1", influence: 0.5, bias: 0 }],
  };
}

describe("useSimulationConfig — role quotas (#122)", () => {
  const dummyFile = new File(["{}"], "config.json", { type: "application/json" });

  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    setupMocks();
  });

  describe("custom wizard — agent quota (maxAgents)", () => {
    it("blocks the agents step when the defined agents exceed maxAgents", () => {
      setupMocks({ maxAgents: 2 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
        result.current.goToStep("agents");
      });
      act(() => {
        result.current.updateValues(customWithAgents(3));
      });

      let valid = true;
      act(() => {
        valid = result.current.validateAndAdvance();
      });

      expect(valid).toBe(false);
      expect(result.current.errors.agentLimitExceeded).toBe(true);
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.nextInvalidToast");
    });

    it("accepts a custom network with exactly maxAgents agents", () => {
      setupMocks({ maxAgents: 2 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
        result.current.goToStep("agents");
      });
      act(() => {
        result.current.updateValues(customWithAgents(2));
      });

      let valid = false;
      act(() => {
        valid = result.current.validateAndAdvance();
      });

      expect(valid).toBe(true);
      expect(result.current.errors).toEqual({});
    });

    it("does not launch (JSON or binary) when the agent count exceeds maxAgents", async () => {
      setupMocks({ maxAgents: 2 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
      });
      act(() => {
        result.current.updateValues(customWithAgents(3));
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(simulationsApi.startCustom).not.toHaveBeenCalled();
      expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
      expect(result.current.errors.agentLimitExceeded).toBe(true);
      expect(toast.error).toHaveBeenCalledWith("simulationConfig.launchInvalidToast");
    });

    it("re-checks the iteration quota at launch (the review step can be reached directly)", async () => {
      setupMocks({ maxIterations: 50 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
      });
      act(() => {
        result.current.updateValues({ ...validCustomValues, iterationLimit: 51 });
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(simulationsApi.startCustom).not.toHaveBeenCalled();
      expect(result.current.errors.iterationLimitExceeded).toBe(true);
    });

    it("launches when the custom network is within the quotas", async () => {
      setupMocks({ maxAgents: 2, maxIterations: 100 });
      vi.mocked(estimateJsonSize).mockReturnValue(100);
      vi.mocked(simulationsApi.startCustom).mockResolvedValue(mockSimCreated);
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.setNetworkType("custom");
      });
      act(() => {
        result.current.updateValues(customWithAgents(2));
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(simulationsApi.startCustom).toHaveBeenCalledOnce();
    });

    it("surfaces agentLimitExceeded after importing a custom network above maxAgents", async () => {
      setupMocks({ maxAgents: 1 });
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

      // validCustomValues defines 2 agents, limit is 1
      expect(result.current.errors.agentLimitExceeded).toBe(true);
    });
  });

  describe("generated wizard — network quota (maxNetworks)", () => {
    it("blocks the network step when numberOfNetworks exceeds the session maxNetworks", () => {
      setupMocks({ maxNetworks: 5 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ ...validGeneratedValues, numberOfNetworks: 6 });
      });

      let valid = true;
      act(() => {
        valid = result.current.validateAndAdvance();
      });

      expect(valid).toBe(false);
      expect(result.current.errors.networkLimitExceeded).toBe(true);
    });

    it("accepts numberOfNetworks equal to maxNetworks", () => {
      setupMocks({ maxNetworks: 5 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ ...validGeneratedValues, numberOfNetworks: 5 });
      });

      let valid = false;
      act(() => {
        valid = result.current.validateAndAdvance();
      });

      expect(valid).toBe(true);
      expect(result.current.maxNetworks).toBe(5);
    });

    it("does not call startGenerated when numberOfNetworks exceeds maxNetworks", async () => {
      setupMocks({ maxNetworks: 1 });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ ...validGeneratedValues, numberOfNetworks: 2 });
      });

      await act(async () => {
        await result.current.submit();
      });

      expect(simulationsApi.startGenerated).not.toHaveBeenCalled();
      expect(result.current.errors.networkLimitExceeded).toBe(true);
    });

    it("treats an unlimited (Infinity) maxNetworks as no cap", () => {
      setupMocks({ maxNetworks: Infinity, roles: ["Administrator"] });
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        result.current.updateValues({ ...validGeneratedValues, numberOfNetworks: 1000 });
      });

      let valid = false;
      act(() => {
        valid = result.current.validateAndAdvance();
      });

      expect(valid).toBe(true);
    });

    it.each([
      ["Guest", 1],
      ["BaseUser", 5],
      ["Researcher", 20],
    ] as const)("falls back to the %s role table when the session lacks maxNetworks", (role, cap) => {
      setupMocks({ roles: [role] });
      const { result } = renderHook(() => useSimulationConfig());
      expect(result.current.maxNetworks).toBe(cap);

      act(() => {
        result.current.updateValues({ ...validGeneratedValues, numberOfNetworks: cap });
      });
      let valid = false;
      act(() => {
        valid = result.current.validateAndAdvance();
      });
      expect(valid).toBe(true);

      act(() => {
        result.current.updateValues({ numberOfNetworks: cap + 1 });
      });
      act(() => {
        valid = result.current.validateAndAdvance();
      });
      expect(valid).toBe(false);
      expect(result.current.errors.networkLimitExceeded).toBe(true);
    });

    it("surfaces networkLimitExceeded after importing generated values above maxNetworks", async () => {
      setupMocks({ maxNetworks: 1 });
      const imported = { ...validGeneratedValues, numberOfNetworks: 3 };
      vi.mocked(readJsonFile).mockResolvedValue(imported);
      vi.mocked(parseEnvelope).mockReturnValue({
        createdAt: "2024-01-01T00:00:00.000Z",
        appVersion: "1.0.0",
        payload: imported as unknown as Record<string, unknown>,
      });
      const { result } = renderHook(() => useSimulationConfig());

      await act(async () => {
        await result.current.handleImportFile(dummyFile);
      });

      expect(result.current.errors.networkLimitExceeded).toBe(true);
    });
  });

  describe("generated wizard — density below the agents per network", () => {
    it("sets densityExceedsAgents when density equals numberOfAgents", () => {
      const { result } = renderHook(() => useSimulationConfig());

      act(() => {
        // computeMaxEdges(10, 10) = 90 — bias rows match, only the density rule fails
        result.current.updateValues({
          ...validGeneratedValues,
          density: 10,
          biasTypes: [{ id: "b0", count: 90, cognitiveBias: 0 }],
        });
      });

      let valid = true;
      act(() => {
        valid = result.current.validateAndAdvance();
      });

      expect(valid).toBe(false);
      expect(result.current.errors.densityExceedsAgents).toBe(true);
      expect(result.current.errors.countsInvalid).toBeUndefined();
    });
  });
});

describe("useSimulationConfig — custom name length limit (#122)", () => {
  const dummyFile = new File(["{}"], "config.json", { type: "application/json" });
  const longName = "N".repeat(33);
  const limitName = "N".repeat(32);

  /** validCustomValues with agent "A" renamed (edges follow, so only the name rule can fail). */
  function withAgentName(name: string): CustomSimFormValues {
    return {
      ...validCustomValues,
      agents: validCustomValues.agents.map((a, i) => (i === 0 ? { ...a, name } : a)),
      edges: [{ source: name, target: "B", influence: 0.5, bias: 0 }],
    };
  }

  function mockImport(payload: unknown) {
    vi.mocked(readJsonFile).mockResolvedValue(payload);
    vi.mocked(parseEnvelope).mockReturnValue({
      createdAt: "2024-01-01T00:00:00.000Z",
      appVersion: "1.0.0",
      payload: payload as Record<string, unknown>,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    setupMocks();
  });

  it("blocks the custom network step when the network name exceeds 32 characters", () => {
    const { result } = renderHook(() => useSimulationConfig());
    act(() => {
      result.current.setNetworkType("custom");
    });
    act(() => {
      result.current.updateValues({ ...validCustomValues, networkName: longName });
    });

    let valid = true;
    act(() => {
      valid = result.current.validateAndAdvance();
    });

    expect(valid).toBe(false);
    expect(result.current.errors.customNetworkNameTooLong).toBe(true);
    expect(result.current.errors.customNetworkNameEmpty).toBeUndefined();
  });

  it("accepts a network name of exactly 32 characters on the network step", () => {
    const { result } = renderHook(() => useSimulationConfig());
    act(() => {
      result.current.setNetworkType("custom");
    });
    act(() => {
      result.current.updateValues({ ...validCustomValues, networkName: limitName });
    });

    let valid = false;
    act(() => {
      valid = result.current.validateAndAdvance();
    });

    expect(valid).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it("blocks the agents step when an agent name exceeds 32 characters", () => {
    const { result } = renderHook(() => useSimulationConfig());
    act(() => {
      result.current.setNetworkType("custom");
      result.current.goToStep("agents");
    });
    act(() => {
      result.current.updateValues(withAgentName(longName));
    });

    let valid = true;
    act(() => {
      valid = result.current.validateAndAdvance();
    });

    expect(valid).toBe(false);
    expect(result.current.errors).toEqual({ customAgentNameTooLong: true });
  });

  it("does not launch (JSON or binary) a custom run with a name over 32 characters", async () => {
    const { result } = renderHook(() => useSimulationConfig());
    act(() => {
      result.current.setNetworkType("custom");
    });
    act(() => {
      result.current.updateValues(withAgentName(longName));
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(simulationsApi.startCustom).not.toHaveBeenCalled();
    expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("simulationConfig.launchInvalidToast");
    expect(result.current.errors.customAgentNameTooLong).toBe(true);
  });

  it("rejects an imported custom file whose agent names exceed 32 characters", async () => {
    mockImport(withAgentName(longName));
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.errors).toEqual({ importInvalid: true });
    expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorImportNameTooLong");
    // The file is not loaded: the wizard keeps its previous (default) draft.
    expect(result.current.networkType).toBe("generated");
    expect(useSimulationConfigStore.getState().customValues.agents).toEqual([]);
  });

  it("rejects an imported custom file whose network name exceeds 32 characters", async () => {
    mockImport({ ...validCustomValues, networkName: longName });
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.errors.importInvalid).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorImportNameTooLong");
    expect(toast.error).not.toHaveBeenCalledWith("simulationConfig.importError");
  });

  it("imports a custom file whose names are exactly 32 characters", async () => {
    mockImport({ ...withAgentName(limitName), networkName: limitName });
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.networkType).toBe("custom");
    expect(result.current.errors).toEqual({});
    expect((result.current.values as CustomSimFormValues).networkName).toBe(limitName);
  });
});

describe("useSimulationConfig — custom agent name uniqueness (#122)", () => {
  const dummyFile = new File(["{}"], "config.json", { type: "application/json" });

  /** validCustomValues ("A", "B", edge A→B) plus a third agent that repeats "A". */
  const duplicatedValues: CustomSimFormValues = {
    ...validCustomValues,
    agents: [...validCustomValues.agents, { ...validCustomValues.agents[0]!, belief: 0.9 }],
  };

  function mockImport(payload: unknown) {
    vi.mocked(readJsonFile).mockResolvedValue(payload);
    vi.mocked(parseEnvelope).mockReturnValue({
      createdAt: "2024-01-01T00:00:00.000Z",
      appVersion: "1.0.0",
      payload: payload as Record<string, unknown>,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    setupMocks();
  });

  it("blocks the agents step when two agents share a name", () => {
    const { result } = renderHook(() => useSimulationConfig());
    act(() => {
      result.current.setNetworkType("custom");
      result.current.goToStep("agents");
    });
    act(() => {
      result.current.updateValues(duplicatedValues);
    });

    let valid = true;
    act(() => {
      valid = result.current.validateAndAdvance();
    });

    expect(valid).toBe(false);
    expect(result.current.errors).toEqual({ customAgentNameDuplicate: true });
    expect(toast.error).toHaveBeenCalledWith("simulationConfig.nextInvalidToast");
  });

  it("does not launch (JSON or binary) a custom run with a repeated agent name", async () => {
    const { result } = renderHook(() => useSimulationConfig());
    act(() => {
      result.current.setNetworkType("custom");
    });
    act(() => {
      result.current.updateValues(duplicatedValues);
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(simulationsApi.startCustom).not.toHaveBeenCalled();
    expect(simulationsApi.startCustomBinary).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("simulationConfig.launchInvalidToast");
    expect(result.current.errors.customAgentNameDuplicate).toBe(true);
  });

  it("rejects an imported custom file with a repeated agent name, naming it in the toast", async () => {
    vi.mocked(useTranslation).mockReturnValue({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key} ${JSON.stringify(params)}` : key,
    } as unknown as ReturnType<typeof useTranslation>);
    mockImport(duplicatedValues);
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.errors).toEqual({ importInvalid: true });
    expect(toast.error).toHaveBeenCalledWith(
      'simulationConfig.errorImportDuplicateAgentName {"name":"A"}',
    );
    expect(toast.error).toHaveBeenCalledOnce();
    // The file is not loaded: the wizard keeps its previous (default) draft.
    expect(result.current.networkType).toBe("generated");
    expect(useSimulationConfigStore.getState().customValues.agents).toEqual([]);
  });

  it("keeps the name-length toast when a file also has names over 32 characters", async () => {
    const longName = "N".repeat(33);
    mockImport({ ...duplicatedValues, networkName: longName });
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.errors.importInvalid).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("simulationConfig.errorImportNameTooLong");
    expect(toast.error).not.toHaveBeenCalledWith("simulationConfig.errorImportDuplicateAgentName");
  });

  it("imports a custom file whose agent names differ only by case", async () => {
    const caseOnly: CustomSimFormValues = {
      ...validCustomValues,
      agents: [...validCustomValues.agents, { ...validCustomValues.agents[0]!, name: "a" }],
    };
    mockImport(caseOnly);
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.networkType).toBe("custom");
    expect(result.current.errors).toEqual({});
  });
});

describe("useSimulationConfig — custom run frame options (#122)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    setupMocks();
  });

  async function launchCustom(jsonSize: number) {
    vi.mocked(estimateJsonSize).mockReturnValue(jsonSize);
    vi.mocked(encodeCustomSimulation).mockReturnValue(new ArrayBuffer(8));
    vi.mocked(simulationsApi.startCustom).mockResolvedValue(mockSimCreated);
    vi.mocked(simulationsApi.startCustomBinary).mockResolvedValue(mockSimCreated);
    const { result } = renderHook(() => useSimulationConfig());
    act(() => {
      result.current.setNetworkType("custom");
    });
    act(() => {
      result.current.updateValues(validCustomValues);
    });
    await act(async () => {
      await result.current.submit();
    });
  }

  it("sends persistFrames / frameRetention to the binary variant (query params)", async () => {
    await launchCustom(BINARY_THRESHOLD_BYTES + 1);

    expect(simulationsApi.startCustomBinary).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
      persistFrames: true,
      frameRetention: "ephemeral",
    });
  });

  it("sends the same values in the JSON body", async () => {
    await launchCustom(BINARY_THRESHOLD_BYTES - 1);

    expect(simulationsApi.startCustom).toHaveBeenCalledWith(
      expect.objectContaining({ persistFrames: true, frameRetention: "ephemeral" }),
    );
  });
});

describe("useSimulationConfig — save mode forced by the backend (#133)", () => {
  const dummyFile = new File(["{}"], "config.json", { type: "application/json" });

  beforeEach(() => {
    vi.clearAllMocks();
    useSimulationConfigStore.getState().reset();
    setupMocks();
  });

  function mockImport(payload: GeneratedSimFormValues | CustomSimFormValues) {
    vi.mocked(readJsonFile).mockResolvedValue(payload);
    vi.mocked(parseEnvelope).mockReturnValue({
      createdAt: "2024-01-01T00:00:00.000Z",
      appVersion: "1.0.0",
      payload: payload as unknown as Record<string, unknown>,
    });
  }

  it("sends the former default (STANDARD = 1) as the constant save mode", () => {
    expect(RUN_SAVE_MODE).toBe(1);
  });

  it("sends RUN_SAVE_MODE in the generated body even when the draft carries another save mode", async () => {
    vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
    const { result } = renderHook(() => useSimulationConfig());

    act(() => {
      result.current.updateValues({ ...validGeneratedValues, saveMode: 0 });
    });
    await act(async () => {
      await result.current.submit();
    });

    expect(simulationsApi.startGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ saveMode: RUN_SAVE_MODE }),
    );
  });

  it.each([
    ["JSON", BINARY_THRESHOLD_BYTES - 1],
    ["binary", BINARY_THRESHOLD_BYTES + 1],
  ])("sends RUN_SAVE_MODE for a custom run (%s variant)", async (variant, jsonSize) => {
    vi.mocked(estimateJsonSize).mockReturnValue(jsonSize);
    vi.mocked(encodeCustomSimulation).mockReturnValue(new ArrayBuffer(8));
    vi.mocked(simulationsApi.startCustom).mockResolvedValue(mockSimCreated);
    vi.mocked(simulationsApi.startCustomBinary).mockResolvedValue(mockSimCreated);
    const { result } = renderHook(() => useSimulationConfig());

    act(() => {
      result.current.setNetworkType("custom");
    });
    act(() => {
      result.current.updateValues({ ...validCustomValues, saveMode: 2 });
    });
    await act(async () => {
      await result.current.submit();
    });

    if (variant === "JSON") {
      expect(simulationsApi.startCustom).toHaveBeenCalledWith(
        expect.objectContaining({ saveMode: RUN_SAVE_MODE }),
      );
    } else {
      expect(encodeCustomSimulation).toHaveBeenCalledWith(
        expect.objectContaining({ saveMode: RUN_SAVE_MODE }),
      );
    }
  });

  it.each([0, 1, 2] as const)("imports a generated file with saveMode %i", async (saveMode) => {
    mockImport({ ...validGeneratedValues, saveMode });
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.networkType).toBe("generated");
    expect(result.current.errors).toEqual({});
    expect(toast.error).not.toHaveBeenCalled();
    // Kept as-is so "Export JSON" gives the same file back.
    expect(result.current.values.saveMode).toBe(saveMode);
  });

  it.each([0, 1, 2] as const)("imports a custom file with saveMode %i", async (saveMode) => {
    mockImport({ ...validCustomValues, saveMode });
    const { result } = renderHook(() => useSimulationConfig());

    await act(async () => {
      await result.current.handleImportFile(dummyFile);
    });

    expect(result.current.networkType).toBe("custom");
    expect(result.current.errors).toEqual({});
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.values.saveMode).toBe(saveMode);
  });

  it("rehydrates a v1 draft with any saveMode unchanged and still launches with RUN_SAVE_MODE", async () => {
    vi.mocked(simulationsApi.startGenerated).mockResolvedValue(mockSimCreated);
    const draft = {
      ...useSimulationConfigStore.getState(),
      step: "review",
      generatedValues: { ...validGeneratedValues, saveMode: 2 },
    };
    localStorage.setItem("bes-simulation-config", JSON.stringify({ state: draft, version: 1 }));

    await useSimulationConfigStore.persist.rehydrate();
    expect(useSimulationConfigStore.getState().step).toBe("review");
    expect(useSimulationConfigStore.getState().generatedValues.saveMode).toBe(2);

    const { result } = renderHook(() => useSimulationConfig());
    await act(async () => {
      await result.current.submit();
    });

    expect(simulationsApi.startGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ saveMode: RUN_SAVE_MODE }),
    );
    localStorage.removeItem("bes-simulation-config");
  });
});
