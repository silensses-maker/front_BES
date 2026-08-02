import { useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { formatNumber } from "../lib/live-summary";

interface QuotaStripProps {
  role: string | null;
  maxAgents: number | null;
  maxIterations: number | null;
  onDiscard: () => void;
}

/**
 * Top strip of the wizard (mockup): the user's role quota on the left and the
 * "Descartar borrador" action (with confirm dialog) on the right.
 */
export function QuotaStrip({ role, maxAgents, maxIterations, onDiscard }: QuotaStripProps) {
  const { t, i18n } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const fmtLimit = (limit: number | null) =>
    limit === null ? "∞" : formatNumber(limit, i18n.language);

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-accent px-2.5 py-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default truncate font-sans text-xs text-muted-foreground">
            {t("simulationConfig.userLimitsHint", {
              role: role ?? "—",
              maxAgents: fmtLimit(maxAgents),
              maxIterations: fmtLimit(maxIterations),
            })}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{t("simulationConfig.quotaTooltip")}</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="shrink-0 px-0"
            onClick={() => setDialogOpen(true)}
          >
            {t("simulationConfig.discardDraft")}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="max-w-60 text-xs">{t("simulationConfig.discardDraftTooltip")}</p>
        </TooltipContent>
      </Tooltip>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("simulationConfig.discardDialogTitle")}</DialogTitle>
            <DialogDescription>{t("simulationConfig.discardDialogBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t("simulationConfig.discardDialogDismiss")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDialogOpen(false);
                onDiscard();
              }}
            >
              {t("simulationConfig.discardDialogConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
