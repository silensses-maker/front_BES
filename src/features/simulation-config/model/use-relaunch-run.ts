import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuthStore } from "@/entities/user";
import { simulationsApi } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import { relaunchPrefill } from "../lib/relaunch";
import { useSimulationConfigStore } from "./simulation-config.store";

export interface UseRelaunchRunReturn {
  /** Pre-fills the wizard with a GENERATED run's stored configuration and opens it (#127). */
  relaunch: (runId: string) => Promise<void>;
  /** Run whose configuration is being fetched, or null. */
  relaunchingRunId: string | null;
}

/**
 * "Re-launch" from the history (#127): fetches the stored configuration of a generated run
 * (`GET /simulations/{runId}/config`), rebuilds the wizard values (relaunchPrefill) and opens the
 * new-simulation panel on Review. It never starts a run: the user launches it, with the usual
 * validation and quotas. Custom runs are re-launched by loading their exported file instead.
 */
export function useRelaunchRun(): UseRelaunchRunReturn {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const applyRelaunch = useSimulationConfigStore((s) => s.applyRelaunch);
  // Without a session factor the density is rebuilt as if no factor applied (1.0).
  const densityFactor = useAuthStore((s) => s.user?.usageLimits?.densityFactor) ?? 1;
  const [relaunchingRunId, setRelaunchingRunId] = useState<string | null>(null);

  const relaunch = useCallback(
    async (runId: string) => {
      setRelaunchingRunId(runId);
      try {
        const config = await simulationsApi.getConfig(runId);
        const prefill = relaunchPrefill(config, densityFactor);
        applyRelaunch(prefill.values, {
          runId,
          seed: config.seed,
          seedKept: prefill.seedKept,
          densityExact: prefill.densityExact,
          effectiveDensity: config.effectiveDensity,
          effectiveNow: prefill.effectiveNow,
        });
        void navigate("/board/new-simulation");
        toast.success(t("simulationConfig.relaunchSuccessToast"));
      } catch (error) {
        logger.error("useRelaunchRun", error);
        toast.error(t("simulationConfig.errorRelaunch"));
      } finally {
        setRelaunchingRunId(null);
      }
    },
    [applyRelaunch, densityFactor, navigate, t],
  );

  return { relaunch, relaunchingRunId };
}
