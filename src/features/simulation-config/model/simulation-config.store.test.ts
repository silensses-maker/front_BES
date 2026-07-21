import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CUSTOM_FORM,
  DEFAULT_FORM,
  useSimulationConfigStore,
} from "./simulation-config.store";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("zustand/middleware", () => ({
  persist: <T>(fn: T) => fn,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useSimulationConfigStore", () => {
  beforeEach(() => {
    useSimulationConfigStore.getState().reset();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts with networkType 'generated'", () => {
      expect(useSimulationConfigStore.getState().networkType).toBe("generated");
    });

    it("starts with step 'network'", () => {
      expect(useSimulationConfigStore.getState().step).toBe("network");
    });

    it("starts with generatedValues matching DEFAULT_FORM", () => {
      expect(useSimulationConfigStore.getState().generatedValues).toEqual(DEFAULT_FORM);
    });

    it("starts with customValues matching DEFAULT_CUSTOM_FORM", () => {
      expect(useSimulationConfigStore.getState().customValues).toEqual(DEFAULT_CUSTOM_FORM);
    });

    it("starts with activeTemplate null", () => {
      expect(useSimulationConfigStore.getState().activeTemplate).toBeNull();
    });
  });

  describe("setNetworkType", () => {
    it("sets networkType to 'custom'", () => {
      useSimulationConfigStore.getState().setNetworkType("custom");
      expect(useSimulationConfigStore.getState().networkType).toBe("custom");
    });

    it("sets networkType back to 'generated'", () => {
      useSimulationConfigStore.setState({ networkType: "custom" });
      useSimulationConfigStore.getState().setNetworkType("generated");
      expect(useSimulationConfigStore.getState().networkType).toBe("generated");
    });

    it("sets networkType to 'load'", () => {
      useSimulationConfigStore.getState().setNetworkType("load");
      expect(useSimulationConfigStore.getState().networkType).toBe("load");
    });

    it("resets step to 'network' for non-load types", () => {
      useSimulationConfigStore.setState({ step: "agents" });
      useSimulationConfigStore.getState().setNetworkType("custom");
      expect(useSimulationConfigStore.getState().step).toBe("network");
    });

    it("resets step to 'network' when switching from 'load' to 'generated'", () => {
      useSimulationConfigStore.setState({ networkType: "load", step: "load" });
      useSimulationConfigStore.getState().setNetworkType("generated");
      expect(useSimulationConfigStore.getState().step).toBe("network");
    });

    it("sets step to 'load' when networkType is 'load'", () => {
      useSimulationConfigStore.setState({ step: "agents" });
      useSimulationConfigStore.getState().setNetworkType("load");
      expect(useSimulationConfigStore.getState().step).toBe("load");
    });

    it("preserves generatedValues and customValues after call", () => {
      const patch = { numberOfAgents: 42 };
      useSimulationConfigStore.getState().updateGeneratedValues(patch);

      useSimulationConfigStore.getState().setNetworkType("custom");

      expect(useSimulationConfigStore.getState().generatedValues.numberOfAgents).toBe(42);
      expect(useSimulationConfigStore.getState().customValues).toEqual(DEFAULT_CUSTOM_FORM);
    });
  });

  describe("setStep", () => {
    it("sets step to 'agents'", () => {
      useSimulationConfigStore.getState().setStep("agents");
      expect(useSimulationConfigStore.getState().step).toBe("agents");
    });

    it("sets step to 'review'", () => {
      useSimulationConfigStore.getState().setStep("review");
      expect(useSimulationConfigStore.getState().step).toBe("review");
    });

    it("sets step back to 'network'", () => {
      useSimulationConfigStore.setState({ step: "review" });
      useSimulationConfigStore.getState().setStep("network");
      expect(useSimulationConfigStore.getState().step).toBe("network");
    });

    it("preserves all other state values", () => {
      useSimulationConfigStore.setState({ networkType: "custom", activeTemplate: "my-template" });
      useSimulationConfigStore.getState().setStep("review");

      const state = useSimulationConfigStore.getState();
      expect(state.networkType).toBe("custom");
      expect(state.activeTemplate).toBe("my-template");
    });
  });

  describe("updateGeneratedValues", () => {
    it("merges patch into generatedValues", () => {
      useSimulationConfigStore.getState().updateGeneratedValues({ numberOfAgents: 20 });
      expect(useSimulationConfigStore.getState().generatedValues.numberOfAgents).toBe(20);
    });

    it("preserves untouched generatedValues keys", () => {
      const before = useSimulationConfigStore.getState().generatedValues;
      useSimulationConfigStore.getState().updateGeneratedValues({ numberOfAgents: 20 });
      const after = useSimulationConfigStore.getState().generatedValues;

      expect(after.iterationLimit).toBe(before.iterationLimit);
      expect(after.density).toBe(before.density);
      expect(after.agentTypes).toEqual(before.agentTypes);
    });

    it("handles an empty patch without modifying state", () => {
      const before = useSimulationConfigStore.getState().generatedValues;
      useSimulationConfigStore.getState().updateGeneratedValues({});
      expect(useSimulationConfigStore.getState().generatedValues).toEqual(before);
    });
  });

  describe("updateCustomValues", () => {
    it("merges patch into customValues", () => {
      useSimulationConfigStore.getState().updateCustomValues({ networkName: "test-net" });
      expect(useSimulationConfigStore.getState().customValues.networkName).toBe("test-net");
    });

    it("preserves untouched customValues keys", () => {
      const before = useSimulationConfigStore.getState().customValues;
      useSimulationConfigStore.getState().updateCustomValues({ networkName: "test-net" });
      const after = useSimulationConfigStore.getState().customValues;

      expect(after.iterationLimit).toBe(before.iterationLimit);
      expect(after.stopThreshold).toBe(before.stopThreshold);
    });
  });

  describe("setActiveTemplate", () => {
    it("sets activeTemplate to a string value", () => {
      useSimulationConfigStore.getState().setActiveTemplate("consensus-pursuit");
      expect(useSimulationConfigStore.getState().activeTemplate).toBe("consensus-pursuit");
    });

    it("sets activeTemplate to null", () => {
      useSimulationConfigStore.setState({ activeTemplate: "consensus-pursuit" });
      useSimulationConfigStore.getState().setActiveTemplate(null);
      expect(useSimulationConfigStore.getState().activeTemplate).toBeNull();
    });
  });

  describe("reset", () => {
    it("resets all state back to initial values after modifications", () => {
      useSimulationConfigStore.getState().setNetworkType("custom");
      useSimulationConfigStore.getState().setStep("review");
      useSimulationConfigStore.getState().updateGeneratedValues({ numberOfAgents: 99 });
      useSimulationConfigStore.getState().updateCustomValues({ networkName: "modified" });
      useSimulationConfigStore.getState().setActiveTemplate("some-template");

      useSimulationConfigStore.getState().reset();

      const state = useSimulationConfigStore.getState();
      expect(state.networkType).toBe("generated");
      expect(state.step).toBe("network");
      expect(state.generatedValues).toEqual(DEFAULT_FORM);
      expect(state.customValues).toEqual(DEFAULT_CUSTOM_FORM);
      expect(state.activeTemplate).toBeNull();
    });
  });
});
