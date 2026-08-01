import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Slider } from "@/shared/ui/slider";
import { REPLAY_SPEEDS, type ReplaySpeed, type ReplayStatus } from "../model/use-replay-engine";

interface ReplayControlBarProps {
  status: ReplayStatus;
  currentRound: number;
  finalRound: number | null;
  speed: ReplaySpeed;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (round: number) => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
}

/**
 * Transport bar for the replay view: play/pause, round scrubber, speed select.
 * Controls are disabled while loading; the slider stays enabled during
 * `seeking` so the user can re-target a pending seek.
 */
export function ReplayControlBar({
  status,
  currentRound,
  finalRound,
  speed,
  isPlaying,
  onTogglePlay,
  onSeek,
  onSpeedChange,
}: ReplayControlBarProps) {
  const { t } = useTranslation();
  // Round shown while the user is dragging the scrubber, before commit.
  const [scrubRound, setScrubRound] = useState<number | null>(null);

  const loading = status === "loading" || status === "idle";
  const interactable = !loading && status !== "unavailable" && status !== "error";
  const total = finalRound ?? 0;
  const shownRound = scrubRound ?? currentRound;
  const PlayIcon = isPlaying ? Pause : Play;

  return (
    <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!interactable}
        aria-label={isPlaying ? t("replay.pause") : t("replay.play")}
        onClick={onTogglePlay}
      >
        <PlayIcon />
      </Button>

      <Slider
        value={[shownRound]}
        min={0}
        max={Math.max(total, 1)}
        step={1}
        disabled={!interactable}
        aria-label={t("replay.scrubberLabel")}
        className="flex-1"
        onValueChange={([value]) => setScrubRound(value ?? 0)}
        onValueCommit={([value]) => {
          setScrubRound(null);
          onSeek(value ?? 0);
        }}
      />

      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {status === "seeking"
          ? t("replay.seeking")
          : t("replay.roundLabel", { current: String(shownRound), total: String(total) })}
      </span>

      <Select
        value={String(speed)}
        disabled={!interactable}
        onValueChange={(value) => onSpeedChange(Number(value) as ReplaySpeed)}
      >
        <SelectTrigger size="sm" className="w-20" aria-label={t("replay.speedLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPLAY_SPEEDS.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}×
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
