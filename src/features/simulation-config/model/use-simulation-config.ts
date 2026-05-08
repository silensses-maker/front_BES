import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSimulationStore } from "@/entities/simulation";
import { useAuthStore } from "@/entities/user";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { isErrorCode } from "@/shared/lib/backend-error";
import {
  BINARY_THRESHOLD_BYTES,
  encodeCustomSimulation,
  estimateJsonSize,
} from "@/shared/lib/custom-simulation-encoder";
import { logger } from "@/shared/lib/logger";
import {
  buildEnvelope,
  downloadEnvelopeJson,
  parseEnvelope,
  readJsonFile,
} from "@/shared/lib/simulation-export";
import { rebalanceCounts } from "../lib/rebalance";
import { computeMaxEdges, customSimSchema, generatedSimSchema } from "../lib/validation";
import type {
  CustomSimFormValues,
  GeneratedSimFormValues,
  NetworkType,
  SimConfigValidationErrors,
  WizardStep,
} from "../types/simulation-config.types";
import { useSimulationConfigStore } from "./simulation-config.store";

function validateCustomForm(values: CustomSimFormValues): SimConfigValidationErrors {
  const errors: SimConfigValidationErrors = {};
  const result = customSimSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const msg = issue.message;
      const path = issue.path[0];

      if (msg === "duplicateEdge") {
        errors.customEdgeDuplicate = true;
      } else if (msg === "edgeUnknownAgent") {
        errors.customEdgeUnknownAgent = true;
      } else if (path === "networkName") {
        errors.customNetworkNameEmpty = true;
      } else if (path === "stopThreshold") {
        errors.stopThresholdOutOfRange = true;
      } else if (path === "agents") {
        // min(1) fires at the "agents" root path
        errors.customNoAgents = true;
      } else if (path === "edges") {
        // min(1) fires at the "edges" root path
        errors.customNoEdges = true;
      } else if (typeof path === "string") {
        errors.countsInvalid = true;
      } else {
        // Nested path: agents[i].* or edges[i].*
        const parentKey = issue.path[0];
        if (parentKey === "agents") {
          errors.customAgentInvalid = true;
        } else {
          errors.customEdgeInvalid = true;
        }
      }
    }
  }

  return errors;
}

function validateGeneratedForm(
  values: GeneratedSimFormValues,
  maxAgents: number | undefined,
  maxIterations: number | undefined,
): SimConfigValidationErrors {
  const errors: SimConfigValidationErrors = {};
  const result = generatedSimSchema.safeParse(values);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const msg = issue.message;
      const path = issue.path[0];

      if (msg === "agentCountMismatch") {
        errors.agentCountMismatch = true;
      } else if (msg === "biasCountMismatch") {
        errors.biasCountMismatch = true;
      } else if (path === "stopThreshold") {
        errors.stopThresholdOutOfRange = true;
      } else {
        errors.countsInvalid = true;
      }
    }
  }

  const totalAgents = values.agentTypes.reduce((sum, r) => sum + r.count, 0);

  if (
    maxIterations !== undefined &&
    maxIterations !== null &&
    values.iterationLimit > maxIterations
  ) {
    errors.iterationLimitExceeded = true;
  }

  if (maxAgents !== undefined && maxAgents !== null && totalAgents > maxAgents) {
    errors.agentLimitExceeded = true;
  }

  return errors;
}

function hasErrors(errors: SimConfigValidationErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * When network-level params change (`numberOfAgents`, `density`), rebalance
 * `agentTypes` / `biasTypes` row counts so they keep summing to the new totals.
 *
 * Only runs when the user did NOT also explicitly patch `agentTypes` /
 * `biasTypes` in the same update — the explicit edit always wins.
 *
 * Without this, changing `numberOfAgents` from 100 → 500 in step "Network"
 * leaves `agentTypes[0].count = 100` and the schema's `superRefine` then emits
 * `agentCountMismatch` / `biasCountMismatch` errors that are only visible in
 * the "Agents" / "Review" steps — leaving the launch button silently disabled.
 */
function enrichGeneratedPatch(
  patch: Partial<GeneratedSimFormValues>,
  current: GeneratedSimFormValues,
): Partial<GeneratedSimFormValues> {
  const next = { ...patch };

  const numberOfAgentsChanged = patch.numberOfAgents !== undefined;
  const densityChanged = patch.density !== undefined;

  if (numberOfAgentsChanged && patch.agentTypes === undefined) {
    next.agentTypes = rebalanceCounts(current.agentTypes, patch.numberOfAgents ?? 0);
  }

  if ((numberOfAgentsChanged || densityChanged) && patch.biasTypes === undefined) {
    const newAgents = patch.numberOfAgents ?? current.numberOfAgents;
    const newDensity = patch.density ?? current.density;
    const newMaxEdges = computeMaxEdges(newDensity, newAgents);
    next.biasTypes = rebalanceCounts(current.biasTypes, newMaxEdges);
  }

  return next;
}

export function useSimulationConfig() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setRunId = useSimulationStore((s) => s.setRunId);
  const setStatus = useSimulationStore((s) => s.setStatus);
  const user = useAuthStore((s) => s.user);

  const maxAgents = user?.usageLimits?.maxAgents;
  const maxIterations = user?.usageLimits?.maxIterations;

  // Persistent wizard state from store
  const networkType = useSimulationConfigStore((s) => s.networkType);
  const step = useSimulationConfigStore((s) => s.step);
  const generatedValues = useSimulationConfigStore((s) => s.generatedValues);
  const customValues = useSimulationConfigStore((s) => s.customValues);
  const activeTemplate = useSimulationConfigStore((s) => s.activeTemplate);
  const storeSetNetworkType = useSimulationConfigStore((s) => s.setNetworkType);
  const setStep = useSimulationConfigStore((s) => s.setStep);
  const storeUpdateGeneratedValues = useSimulationConfigStore((s) => s.updateGeneratedValues);
  const storeUpdateCustomValues = useSimulationConfigStore((s) => s.updateCustomValues);
  const storeSetActiveTemplate = useSimulationConfigStore((s) => s.setActiveTemplate);
  const storeReset = useSimulationConfigStore((s) => s.reset);

  // Non-persistent local state
  const [errors, setErrors] = useState<SimConfigValidationErrors>({});
  const [loading, setLoading] = useState(false);
  const [usageLimitError, setUsageLimitError] = useState<{
    limit: number;
    requested: number;
  } | null>(null);

  // Derived: the active values slot for the current networkType
  const values = networkType === "generated" ? generatedValues : customValues;

  const updateValues = (patch: Partial<GeneratedSimFormValues> | Partial<CustomSimFormValues>) => {
    if (networkType === "generated") {
      const enriched = enrichGeneratedPatch(
        patch as Partial<GeneratedSimFormValues>,
        generatedValues,
      );
      storeUpdateGeneratedValues(enriched);
      // Any user-driven edit means the values no longer strictly match a
      // template — clear the active selection so the quick-start pills
      // accurately reflect "no template applied".
      if (activeTemplate !== null) {
        storeSetActiveTemplate(null);
      }
    } else {
      storeUpdateCustomValues(patch as Partial<CustomSimFormValues>);
    }
  };

  const setNetworkType = (type: NetworkType) => {
    storeSetNetworkType(type);
    setErrors({});
    setUsageLimitError(null);
  };

  const goToStep = (target: WizardStep) => setStep(target);

  const validateAndAdvance = (): boolean => {
    // "load" path: file was already parsed and loaded into generatedValues /
    // customValues by loadFileAndAdvance. Nothing left to validate here.
    if (networkType === "load") return true;

    if (networkType === "generated") {
      const errs = validateGeneratedForm(
        generatedValues,
        maxAgents ?? undefined,
        maxIterations ?? undefined,
      );
      setErrors(errs);
      return !hasErrors(errs);
    }
    // custom: step "network" only checks the 4 header fields
    if (step === "network") {
      const errs: SimConfigValidationErrors = {};
      if (!customValues.networkName.trim()) errs.customNetworkNameEmpty = true;
      if (customValues.stopThreshold <= 0 || customValues.stopThreshold >= 1)
        errs.stopThresholdOutOfRange = true;
      if (maxIterations != null && customValues.iterationLimit > maxIterations)
        errs.iterationLimitExceeded = true;
      setErrors(errs);
      return !hasErrors(errs);
    }
    // custom: step "agents" — full validation
    const errs = validateCustomForm(customValues);
    setErrors(errs);
    return !hasErrors(errs);
  };

  const submit = async () => {
    // "load" step should never reach submit directly; the wizard redirects to
    // "review" after a successful file load. Guard defensively.
    if (networkType === "load") {
      toast.error(t("simulationConfig.errorLoadNotReady"));
      return;
    }

    if (networkType === "generated") {
      const errs = validateGeneratedForm(
        generatedValues,
        maxAgents ?? undefined,
        maxIterations ?? undefined,
      );
      setErrors(errs);
      if (hasErrors(errs)) return;
    } else {
      const errs = validateCustomForm(customValues);
      setErrors(errs);
      if (hasErrors(errs)) return;
    }

    setUsageLimitError(null);
    setLoading(true);
    try {
      let result: Awaited<ReturnType<typeof simulationsApi.startGenerated>>;

      if (networkType === "generated") {
        const body = {
          numberOfNetworks: generatedValues.numberOfNetworks,
          density: generatedValues.density,
          iterationLimit: generatedValues.iterationLimit,
          stopThreshold: generatedValues.stopThreshold,
          seed: generatedValues.seed ?? undefined,
          saveMode: generatedValues.saveMode,
          agentTypes: generatedValues.agentTypes.map((row) => ({
            silenceStrategy: row.silenceStrategy as 0 | 1 | 2,
            silenceEffect: row.silenceEffect as 0 | 1,
            count: row.count,
          })),
          biasTypes: generatedValues.biasTypes.map((row) => ({
            biasType: row.cognitiveBias as 0 | 1 | 2 | 3,
            count: row.count,
          })),
        };
        result = await simulationsApi.startGenerated(body);
      } else {
        const shouldUseBinary =
          estimateJsonSize(customValues.agents, customValues.edges) > BINARY_THRESHOLD_BYTES;

        if (shouldUseBinary) {
          const buffer = encodeCustomSimulation({
            networkName: customValues.networkName,
            iterationLimit: customValues.iterationLimit,
            stopThreshold: customValues.stopThreshold,
            saveMode: customValues.saveMode,
            agents: customValues.agents.map((a) => ({
              name: a.name,
              belief: a.belief,
              toleranceRadius: a.toleranceRadius,
              toleranceOffset: a.toleranceOffset,
              silenceStrategy: a.silenceStrategy as 0 | 1 | 2 | 3,
              silenceEffect: a.silenceEffect as 0 | 1 | 2,
            })),
            edges: customValues.edges.map((e) => ({
              source: e.source,
              target: e.target,
              influence: e.influence,
              bias: e.bias as 0 | 1 | 2 | 3 | 4,
            })),
          });
          result = await simulationsApi.startCustomBinary(buffer);
        } else {
          result = await simulationsApi.startCustom({
            name: customValues.networkName,
            iterationLimit: customValues.iterationLimit,
            stopThreshold: customValues.stopThreshold,
            saveMode: customValues.saveMode,
            agents: customValues.agents,
            edges: customValues.edges,
          });
        }
      }

      setRunId(result.runId);
      setStatus("running");
      navigate(`/board/simulation/${result.runId}`);
      storeReset();
    } catch (error) {
      logger.error("useSimulationConfig", error);
      if (isErrorCode(error, "usage_limit_exceeded")) {
        const axiosError = error as {
          response?: { data?: { limit?: number; requested?: number } };
        };
        const limit = axiosError.response?.data?.limit ?? 0;
        const requested = axiosError.response?.data?.requested ?? 0;
        setUsageLimitError({ limit, requested });
        toast.error(t("simulationConfig.errorLimitExceeded"));
      } else {
        toast.error(t("simulationConfig.errorSubmit"));
      }
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (key: string, template: GeneratedSimFormValues) => {
    storeUpdateGeneratedValues(template);
    storeSetActiveTemplate(key);
    setErrors({});
    setUsageLimitError(null);
  };

  // ─── Import / Export JSON ─────────────────────────────────────────────────

  const exportConfig = () => {
    const envelope = buildEnvelope(values as unknown as Record<string, unknown>);
    downloadEnvelopeJson(envelope, values.networkType);
  };

  const handleImportFile = async (file: File) => {
    let raw: unknown;
    try {
      raw = await readJsonFile(file);
    } catch (error) {
      logger.error("useSimulationConfig.handleImportFile", error);
      toast.error(t("simulationConfig.errorImportInvalid"));
      return;
    }

    const envelope = parseEnvelope(raw);
    if (envelope === null) {
      setErrors({ importInvalid: true });
      toast.error(t("simulationConfig.errorImportInvalid"));
      return;
    }

    const payload = envelope.payload;

    if (payload.networkType === "generated") {
      const result = generatedSimSchema.safeParse(payload);
      if (!result.success) {
        setErrors({ importInvalid: true });
        toast.error(t("simulationConfig.importError"));
        return;
      }
      const imported = result.data as GeneratedSimFormValues;
      storeSetNetworkType("generated");
      storeUpdateGeneratedValues(imported);
      storeSetActiveTemplate(null);

      // Re-validate usage limits against the imported values — load the values
      // regardless so the user can see and adjust them, but surface the errors.
      const limitErrors: SimConfigValidationErrors = {};
      if (maxAgents != null && imported.numberOfAgents > maxAgents) {
        limitErrors.agentLimitExceeded = true;
      }
      if (maxIterations != null && imported.iterationLimit > maxIterations) {
        limitErrors.iterationLimitExceeded = true;
      }
      setErrors(limitErrors);
      setUsageLimitError(null);
    } else if (payload.networkType === "custom") {
      const result = customSimSchema.safeParse(payload);
      if (!result.success) {
        setErrors({ importInvalid: true });
        toast.error(t("simulationConfig.importError"));
        return;
      }
      const imported = result.data as CustomSimFormValues;
      storeSetNetworkType("custom");
      storeUpdateCustomValues(imported);

      // Re-validate usage limits for custom path
      const limitErrors: SimConfigValidationErrors = {};
      if (maxIterations != null && imported.iterationLimit > maxIterations) {
        limitErrors.iterationLimitExceeded = true;
      }
      setErrors(limitErrors);
      setUsageLimitError(null);
    } else {
      setErrors({ importInvalid: true });
      toast.error(t("simulationConfig.errorImportInvalid"));
    }
  };

  // ─── Load path ───────────────────────────────────────────────────────────────
  // Parses a dropped/selected file, loads its values into the store, then
  // advances the wizard to "review" so the user can inspect and submit.
  const loadFileAndAdvance = async (file: File) => {
    await handleImportFile(file);
    // handleImportFile sets errors.importInvalid on failure — check for that.
    // We read the fresh store state via a snapshot rather than stale closure.
    const freshErrors = useSimulationConfigStore.getState();
    // If networkType is still "load" after the import call, the parse failed
    // (handleImportFile switches networkType to "generated" or "custom" on
    // success). Only advance when the type changed.
    if (freshErrors.networkType !== "load") {
      setStep("agents");
    }
  };

  return {
    step,
    networkType,
    values,
    errors,
    loading,
    usageLimitError,
    activeTemplate,
    maxAgents: maxAgents ?? null,
    maxIterations: maxIterations ?? null,
    userRole: user?.roles?.[0] ?? null,
    updateValues,
    setNetworkType,
    goToStep,
    validateAndAdvance,
    submit,
    applyTemplate,
    exportConfig,
    handleImportFile,
    loadFileAndAdvance,
  };
}
