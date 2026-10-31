import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLastRunStore, useLaunchedConfigStore, useSimulationStore } from "@/entities/simulation";
import { getHighestRole, resolveMaxNetworks, useAuthStore } from "@/entities/user";
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
import { fitIterationLimit, RUN_SAVE_MODE } from "../lib/templates";
import {
  computeMaxEdges,
  customSimSchema,
  generatedSimSchema,
  hasValidationErrors,
  MAX_CUSTOM_NAME_LENGTH,
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
 * Frame persistence requested for custom runs. The JSON body carries it as fields; the binary
 * payload has no such fields, so `startCustomBinary` sends the same values as query params.
 */
const CUSTOM_RUN_FRAME_OPTIONS = { persistFrames: true, frameRetention: "ephemeral" } as const;

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
  // Falls back to the role table when the session's usageLimits predate maxNetworks (#122).
  const maxNetworks = user ? resolveMaxNetworks(user) : undefined;

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
  const relaunchedFrom = useSimulationConfigStore((s) => s.relaunchedFrom);
  const storeClearRelaunchedFrom = useSimulationConfigStore((s) => s.clearRelaunchedFrom);
  const storeFitDraftsToQuota = useSimulationConfigStore((s) => s.fitDraftsToQuota);

  // The defaults (100 / 1000 iterations) are over the lower roles' caps (Guest: 10), so a draft
  // the user never typed would fail on the first Next: once the quota is known, and whenever it
  // changes, the drafts' iteration limit is capped at it. A value typed above the cap afterwards
  // still gets the field error.
  useEffect(() => {
    storeFitDraftsToQuota(maxIterations);
  }, [maxIterations, storeFitDraftsToQuota]);

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

  // Errors come from the Next / launch of the step that showed them; another step must not
  // inherit them (the "Agents" mismatch used to follow the user back to "Network").
  const goToStep = (target: WizardStep) => {
    setStep(target);
    setErrors({});
  };

  const validateAndAdvance = (): boolean => {
    // "load" path: file was already parsed and loaded into generatedValues /
    // customValues by loadFileAndAdvance. Nothing left to validate here.
    if (networkType === "load") return true;

    let errs: SimConfigValidationErrors;
    if (networkType === "generated") {
      // The "Network" step validates its own fields; the agent / bias rows are the "Agents"
      // step's and the launch's (see GeneratedValidationScope).
      errs = validateGeneratedForm(
        generatedValues,
        maxAgents ?? undefined,
        maxIterations ?? undefined,
        maxNetworks,
        step === "network" ? "network" : "all",
      );
    } else if (step === "network") {
      // custom: step "network" only checks the header fields
      errs = {};
      if (!customValues.networkName.trim()) errs.customNetworkNameEmpty = true;
      if (customValues.networkName.length > MAX_CUSTOM_NAME_LENGTH)
        errs.customNetworkNameTooLong = true;
      if (customValues.stopThreshold <= 0 || customValues.stopThreshold >= 1)
        errs.stopThresholdOutOfRange = true;
      if (maxIterations != null && customValues.iterationLimit > maxIterations)
        errs.iterationLimitExceeded = true;
    } else {
      // custom: step "agents" — full validation, including the agent/iteration quotas
      errs = validateCustomForm(customValues, maxAgents ?? undefined, maxIterations ?? undefined);
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
        ? validateGeneratedForm(
            generatedValues,
            maxAgents ?? undefined,
            maxIterations ?? undefined,
            maxNetworks,
          )
        : validateCustomForm(customValues, maxAgents ?? undefined, maxIterations ?? undefined);
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
          // Constant, not the form value: the backend saves every run in DEBUG for now (#133).
          saveMode: RUN_SAVE_MODE,
          // AgentTypeReq is { silenceStrategy, silenceEffect, count } — the API has
          // no threshold/confidence fields (the simulator fixes them, #120).
          agentTypes: generatedValues.agentTypes.map((row) => ({
            silenceStrategy: row.silenceStrategy,
            silenceEffect: row.silenceEffect,
            count: row.count,
          })),
          biasTypes: generatedValues.biasTypes.map((row) => ({
            biasType: row.cognitiveBias,
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
            saveMode: RUN_SAVE_MODE,
            agents: customValues.agents.map((a) => ({
              name: a.name,
              belief: a.belief,
              toleranceRadius: a.toleranceRadius,
              toleranceOffset: a.toleranceOffset,
              silenceStrategy: a.silenceStrategy,
              silenceEffect: a.silenceEffect,
            })),
            edges: customValues.edges.map((e) => ({
              source: e.source,
              target: e.target,
              influence: e.influence,
              bias: e.bias,
            })),
          });
          result = await simulationsApi.startCustomBinary(buffer, CUSTOM_RUN_FRAME_OPTIONS);
        } else {
          result = await simulationsApi.startCustom({
            name: customValues.networkName,
            iterationLimit: customValues.iterationLimit,
            stopThreshold: customValues.stopThreshold,
            saveMode: RUN_SAVE_MODE,
            agents: customValues.agents,
            edges: customValues.edges,
            ...CUSTOM_RUN_FRAME_OPTIONS,
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
      // The draft is reset below: keep what was launched so the run detail can export it with
      // its runId and seed (#127).
      useLaunchedConfigStore
        .getState()
        .record(result.runId, values as unknown as Record<string, unknown>);
      setRunId(result.runId);
      setStatus("running");
      void navigate(`/board/simulation/${result.runId}`);
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
    const fitted = fitIterationLimit(template, maxIterations);
    storeUpdateGeneratedValues(fitted);
    storeSetActiveTemplate(key);
    storeClearRelaunchedFrom();
    setErrors({});
    setUsageLimitError(null);
    const name =
      key === "consensus-pursuit"
        ? t("simulationConfig.templateConsensusPursuit")
        : t("simulationConfig.templatePolarization");
    toast.success(
      fitted === template
        ? t("simulationConfig.templateAppliedToast", { name })
        : t("simulationConfig.templateAppliedCappedToast", { name, limit: fitted.iterationLimit }),
    );
  };

  /** Discards the persisted draft and restores wizard defaults (mockup quota strip). */
  const resetDraft = () => {
    storeReset();
    storeFitDraftsToQuota(maxIterations);
    setErrors({});
    setUsageLimitError(null);
    toast.success(t("simulationConfig.discardSuccessToast"));
  };

  // ─── Import / Export JSON ─────────────────────────────────────────────────

  const exportConfig = () => {
    const envelope = buildEnvelope(values as unknown as Record<string, unknown>);
    const file = downloadEnvelopeJson(envelope, values.networkType);
    toast.success(t("simulationConfig.exportSuccessToast", { file }));
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
      if (maxNetworks != null && imported.numberOfNetworks > maxNetworks) {
        limitErrors.networkLimitExceeded = true;
      }
      setErrors(limitErrors);
      setUsageLimitError(null);
    } else if (payload.networkType === "custom") {
      const result = customSimSchema.safeParse(payload);
      if (!result.success) {
        setErrors({ importInvalid: true });
        // Names over the backend's varchar(32) and repeated agent names get their own message:
        // the file is rejected rather than loaded, since every edge refers to the agents by
        // name (#122).
        const nameTooLong = result.error.issues.some((issue) => issue.message === "nameTooLong");
        const duplicate = result.error.issues.find(
          (issue) => issue.message === "duplicateAgentName",
        );
        if (nameTooLong) {
          toast.error(
            t("simulationConfig.errorImportNameTooLong", { max: MAX_CUSTOM_NAME_LENGTH }),
          );
        } else if (duplicate?.code === "custom") {
          toast.error(
            t("simulationConfig.errorImportDuplicateAgentName", {
              name: String(duplicate.params?.name ?? ""),
            }),
          );
        } else {
          toast.error(t("simulationConfig.importError"));
        }
        return;
      }
      const imported = result.data as CustomSimFormValues;
      storeSetNetworkType("custom");
      storeUpdateCustomValues(imported);

      // Re-validate usage limits for custom path
      const limitErrors: SimConfigValidationErrors = {};
      if (maxAgents != null && imported.agents.length > maxAgents) {
        limitErrors.agentLimitExceeded = true;
      }
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
    relaunchedFrom,
    maxAgents: maxAgents ?? null,
    maxIterations: maxIterations ?? null,
    maxNetworks: maxNetworks ?? null,
    userRole: user?.roles?.length ? getHighestRole(user.roles) : null,
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
