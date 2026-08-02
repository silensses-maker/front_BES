import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLastRunStore, useSimulationStore } from "@/entities/simulation";
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
import { useSimulationWsManager } from "@/shared/lib/ws-manager";
import { rebalanceCounts } from "../lib/rebalance";
import {
  computeMaxEdges,
  customSimSchema,
  generatedSimSchema,
  hasValidationErrors,
  validateCustomForm,
  validateGeneratedForm,
} from "../lib/validation";
import type {
  CustomSimFormValues,
  GeneratedSimFormValues,
  NetworkType,
  SimConfigValidationErrors,
  WizardStep,
} from "../types/simulation-config.types";
import { useSimulationConfigStore } from "./simulation-config.store";

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
  const wsManager = useSimulationWsManager();
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
  const loadedFromFile = useSimulationConfigStore((s) => s.loadedFromFile);

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

    let errs: SimConfigValidationErrors;
    if (networkType === "generated") {
      errs = validateGeneratedForm(
        generatedValues,
        maxAgents ?? undefined,
        maxIterations ?? undefined,
      );
    } else if (step === "network") {
      // custom: step "network" only checks the header fields
      errs = {};
      if (!customValues.networkName.trim()) errs.customNetworkNameEmpty = true;
      if (customValues.stopThreshold <= 0 || customValues.stopThreshold >= 1)
        errs.stopThresholdOutOfRange = true;
      if (maxIterations != null && customValues.iterationLimit > maxIterations)
        errs.iterationLimitExceeded = true;
    } else {
      // custom: step "agents" — full validation
      errs = validateCustomForm(customValues);
    }
    setErrors(errs);
    if (hasValidationErrors(errs)) {
      toast.error(t("simulationConfig.nextInvalidToast"));
      return false;
    }
    return true;
  };

  const submit = async () => {
    // "load" step should never reach submit directly; the wizard redirects to
    // "review" after a successful file load. Guard defensively.
    if (networkType === "load") {
      toast.error(t("simulationConfig.errorLoadNotReady"));
      return;
    }

    const launchErrs =
      networkType === "generated"
        ? validateGeneratedForm(generatedValues, maxAgents ?? undefined, maxIterations ?? undefined)
        : validateCustomForm(customValues);
    setErrors(launchErrs);
    if (hasValidationErrors(launchErrs)) {
      toast.error(t("simulationConfig.launchInvalidToast"));
      return;
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
          persistFrames: true,
          frameRetention: "ephemeral" as const,
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
            persistFrames: true,
            frameRetention: "ephemeral",
          });
        }
      }

      // Eager WS subscribe — closes the race window between POST returning
      // and useSimulationStream mounting on the live-run page. The OpenAPI
      // explicitly recommends sending subscribe before the simulation starts.
      // Any events/binary frames that arrive in the meantime are buffered by
      // the manager and drained when useSimulationStream calls subscribe().
      wsManager.prepareRun(result.runId);
      useLastRunStore.getState().startRun({
        runId: result.runId,
        name: networkType === "custom" ? customValues.networkName : null,
        networkCount: result.networkCount ?? null,
      });
      setRunId(result.runId);
      setStatus("running");
      navigate(`/board/simulation/${result.runId}`);
      storeReset();
      toast.success(t("simulationConfig.launchSuccessToast"));
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
    const name =
      key === "consensus-pursuit"
        ? t("simulationConfig.templateConsensusPursuit")
        : t("simulationConfig.templatePolarization");
    toast.success(t("simulationConfig.templateAppliedToast", { name }));
  };

  /** Discards the persisted draft and restores wizard defaults (mockup quota strip). */
  const resetDraft = () => {
    storeReset();
    setErrors({});
    setUsageLimitError(null);
    toast.success(t("simulationConfig.discardSuccessToast"));
  };

  // ─── Import / Export JSON ─────────────────────────────────────────────────

  const exportConfig = () => {
    const envelope = buildEnvelope(values as unknown as Record<string, unknown>);
    downloadEnvelopeJson(envelope, values.networkType);
    toast.success(t("simulationConfig.exportSuccessToast"));
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
      // Mark the draft as file-originated AFTER the type switch (setNetworkType
      // clears the flag) so Review can show "Cargada desde archivo".
      useSimulationConfigStore.getState().setLoadedFromFile(true);
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
    loadedFromFile,
    maxAgents: maxAgents ?? null,
    maxIterations: maxIterations ?? null,
    userRole: user?.roles?.[0] ?? null,
    updateValues,
    setNetworkType,
    goToStep,
    validateAndAdvance,
    submit,
    applyTemplate,
    resetDraft,
    exportConfig,
    handleImportFile,
    loadFileAndAdvance,
  };
}
