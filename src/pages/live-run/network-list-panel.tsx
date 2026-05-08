import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";

interface NetworkListPanelProps {
  runId: string;
  networkIds: string[];
}

export function NetworkListPanel({ runId, networkIds }: NetworkListPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (networkIds.length === 0) {
    return (
      <Card className="flex items-center gap-2 p-4">
        <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="font-sans text-sm text-muted-foreground">
          {t("liveRun.networkPanel.waiting")}
        </span>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="font-sans text-xs font-medium text-muted-foreground">
        {t("liveRun.networkPanel.title")}
      </p>
      <div className="flex flex-col gap-0.5">
        {networkIds.map((id, index) => (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto w-full justify-between gap-2 px-2 py-1.5"
            onClick={() => navigate(`/board/simulation/${runId}/${id}`)}
          >
            <span className="font-sans text-sm">
              {t("liveRun.networkPanel.network", { index: String(index + 1) })}
            </span>
            <span className="font-mono text-xs text-muted-foreground/60">…{id.slice(-8)}</span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
