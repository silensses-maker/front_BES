import { useRef, useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { CONSENSUS_PURSUIT_TEMPLATE } from "../lib/templates";

interface StepLoadProps {
  onLoad: (file: File) => void;
  loading: boolean;
}

type DropzoneState = "idle" | "dragover" | "accepted" | "error";

export function StepLoad({ onLoad, loading }: StepLoadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<DropzoneState>("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleDownloadExample = () => {
    const example = {
      _guide: {
        description:
          "BES simulation configuration file. Drop it in the 'Load file' tab to pre-fill the wizard.",
        networkType: "'generated' = random network  |  'custom' = manually defined network",
        saveMode:
          "0=FULL  1=STANDARD  2=STANDARD_LIGHT  3=ROUNDLESS  4=AGENTLESS_TYPED  5=AGENTLESS  6=PERFORMANCE  7=DEBUG",
        silenceStrategy: "0=DeGroot  1=Majority  2=Threshold  3=Confidence",
        silenceEffect: "0=DeGroot  1=Memory  2=Memoryless",
        cognitiveBias: "0=None  1=Confirmation  2=Backfire  3=Authority  4=Insular",
        seed: "null = random seed each run  |  integer = fixed reproducible seed",
        stopThreshold:
          "convergence criterion — simulation stops when belief change < this value (0 < x < 1)",
        density: "approximate number of neighbors per agent in the generated network",
      },
      createdAt: new Date().toISOString(),
      appVersion: "example",
      payload: CONSENSUS_PURSUIT_TEMPLATE,
    };

    const blob = new Blob([JSON.stringify(example, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bes-config-example.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".json")) {
      setState("error");
      setErrorKey("simulationConfig.loadErrorNotJson");
      return;
    }
    setState("accepted");
    setErrorKey(null);
    onLoad(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setState("dragover");
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setState((prev) => (prev === "dragover" ? "idle" : prev));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={handleDownloadExample}
        >
          {t("simulationConfig.loadDownloadExample")}
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={t("simulationConfig.loadDropzoneTitle")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        className={cn(
          "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors duration-200",
          state === "dragover" && "border-primary bg-primary/5",
          state === "accepted" && "border-primary/60 bg-primary/5",
          state === "error" && "border-destructive/60 bg-destructive/5",
          state === "idle" && "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
          loading && "pointer-events-none opacity-50",
        )}
      >
        {state === "dragover" && (
          <p className="text-sm font-medium text-primary">
            {t("simulationConfig.loadDropzoneActive")}
          </p>
        )}

        {state === "accepted" && (
          <p className="text-sm font-medium text-primary">
            {t("simulationConfig.loadDropzoneAccepted")}
          </p>
        )}

        {state === "error" && (
          <p className="text-sm font-medium text-destructive">
            {t((errorKey ?? "simulationConfig.loadErrorParseFailed") as Parameters<typeof t>[0])}
          </p>
        )}

        {state === "idle" && (
          <>
            <p className="text-sm font-medium">{t("simulationConfig.loadDropzoneTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {t("simulationConfig.loadDropzoneHint")}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              {t("simulationConfig.loadDropzoneButton")}
            </Button>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("simulationConfig.loadNoCsv")}</p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="sr-only"
        onChange={handleInputChange}
      />
    </div>
  );
}
