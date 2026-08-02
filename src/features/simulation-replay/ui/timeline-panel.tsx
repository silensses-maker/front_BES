import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { findAdjacentEvent, type RoundEvent, type RoundEventKind } from "../lib/round-events";
import type { PlaybackSpeed, UsePlaybackEngineReturn } from "../model/use-playback-engine";
import { PLAYBACK_SPEEDS } from "../model/use-playback-engine";
import { fineWindowFor } from "./timeline-canvas-utils";
import { TimelineFineCanvas } from "./timeline-fine-canvas";
import { TimelineOverviewCanvas } from "./timeline-overview-canvas";

interface TimelinePanelProps {
  engine: UsePlaybackEngineReturn;
  events: RoundEvent[];
  /** Drawn axis end: finalRound (finished) or the iteration limit (live). */
  domainEnd: number;
}

const EVENT_DOT_CLASS: Record<RoundEventKind, string> = {
  cambio: "bg-primary",
  silencio: "bg-warn",
  fin: "bg-ok",
};

function TransportButton({
  tip,
  aria,
  disabled,
  onClick,
  children,
}: {
  tip: string;
  aria: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={aria}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * "Línea de tiempo" card (mockup): transport row, overview canvas, fine strip
 * for long runs and the go-to-round row with keyboard hints + event legend.
 */
export function TimelinePanel({ engine, events, domainEnd }: TimelinePanelProps) {
  const { t, i18n } = useTranslation();
  const [goTo, setGoTo] = useState("");

  const fmt = (n: number) => formatNumber(n, i18n.language);
  const seekDisabled =
    engine.status === "idle" ||
    engine.status === "loading" ||
    engine.status === "unavailable" ||
    engine.status === "error" ||
    engine.liveScrubBlocked;

  const maxSeekable = engine.isLive ? engine.receivedRound : (engine.finalRound ?? 0);

  const liveChipLabel = engine.isLive
    ? engine.follow
      ? t("runView.liveChipFollowing")
      : engine.isPlaying
        ? t("runView.liveChipPlaying")
        : t("runView.liveChipReviewing")
    : engine.isPlaying
      ? t("runView.liveChipPlaying")
      : t("runView.liveChipIdle");

  const jumpEvent = (dir: 1 | -1) => {
    const candidate = findAdjacentEvent(events, engine.currentRound, dir);
    if (candidate === null) {
      toast.warning(dir > 0 ? t("runView.noMoreEventsAfter") : t("runView.noMoreEventsBefore"));
      return;
    }
    engine.seek(candidate.round);
  };

  const commitGoTo = () => {
    const value = Number.parseInt(goTo, 10);
    if (Number.isNaN(value)) {
      toast.warning(t("runView.goToInvalidToast"));
      return;
    }
    if (value > maxSeekable) {
      toast.warning(
        t("runView.goToClampToast", { received: fmt(maxSeekable), total: fmt(domainEnd) }),
      );
    }
    engine.seek(value);
    setGoTo("");
  };

  const bigStep = Math.max(10, Math.round(domainEnd / 20));
  const fineWindow = domainEnd > 200 ? fineWindowFor(engine.currentRound, domainEnd) : null;

  return (
    <div className="flex flex-none flex-col gap-[7px] rounded-[10px] border border-border bg-card px-3 pb-2 pt-[9px]">
      {/* ── Transport row ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-[7px]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              aria-label={t("runView.playAria")}
              disabled={seekDisabled}
              onClick={engine.togglePlay}
            >
              {engine.isPlaying ? <Pause /> : <Play />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{t("runView.playTip")}</TooltipContent>
        </Tooltip>
        <TransportButton
          tip={t("runView.goStartTip")}
          aria={t("runView.goStartAria")}
          disabled={seekDisabled}
          onClick={() => engine.seek(0)}
        >
          <SkipBack />
        </TransportButton>
        <TransportButton
          tip={t("runView.prevEventTip")}
          aria={t("runView.prevEventAria")}
          disabled={seekDisabled}
          onClick={() => jumpEvent(-1)}
        >
          <ChevronsLeft />
        </TransportButton>
        <TransportButton
          tip={t("runView.stepBackTip")}
          aria={t("runView.stepBackAria")}
          disabled={seekDisabled}
          onClick={() => engine.stepBy(-1)}
        >
          <ChevronLeft />
        </TransportButton>
        <TransportButton
          tip={t("runView.stepFwdTip")}
          aria={t("runView.stepFwdAria")}
          disabled={seekDisabled}
          onClick={() => engine.stepBy(1)}
        >
          <ChevronRight />
        </TransportButton>
        <TransportButton
          tip={t("runView.nextEventTip")}
          aria={t("runView.nextEventAria")}
          disabled={seekDisabled}
          onClick={() => jumpEvent(1)}
        >
          <ChevronsRight />
        </TransportButton>
        <TransportButton
          tip={t("runView.goEndTip")}
          aria={t("runView.goEndAria")}
          disabled={seekDisabled && !engine.isLive}
          onClick={engine.goToEnd}
        >
          <SkipForward />
        </TransportButton>

        <span className="mx-[3px] h-[22px] w-px bg-border" aria-hidden="true" />

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex cursor-default gap-0.5 rounded-lg border border-border bg-muted p-0.5">
              <span className="self-center px-[5px] font-sans text-[11px] text-muted-foreground">
                {t("runView.speedLabel")}
              </span>
              {PLAYBACK_SPEEDS.map((speedOption) => (
                <button
                  key={speedOption}
                  type="button"
                  onClick={() => engine.setSpeed(speedOption as PlaybackSpeed)}
                  className={cn(
                    "h-6 rounded-md px-2.5 font-sans text-[11.5px] font-medium",
                    engine.speed === speedOption
                      ? "bg-accent font-semibold text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  ×{speedOption}
                </button>
              ))}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {t("runView.speedTip", { speed: engine.speed, count: engine.speed })}
          </TooltipContent>
        </Tooltip>

        <span className="min-w-3 flex-1" />

        <span className="flex-none font-mono text-[12.5px] font-semibold">
          {t("runView.roundLabel", { round: fmt(engine.currentRound) })}{" "}
          <span className="font-normal text-muted-foreground">
            {t("runView.roundTotal", { total: fmt(domainEnd) })}
          </span>
        </span>
        <span
          className={cn(
            "flex-none rounded-full px-2.5 py-[3px] font-sans text-[11px] font-medium",
            engine.isLive ? "bg-primary/15 text-primary" : "bg-ok/15 text-ok",
          )}
        >
          {liveChipLabel}
        </span>
        {engine.isLive && !engine.follow && (
          <Button type="button" size="xs" className="rounded-full" onClick={engine.returnToLive}>
            {t("runView.returnToLive")}
          </Button>
        )}
      </div>

      {/* ── Overview canvas ───────────────────────────────── */}
      <TimelineOverviewCanvas
        domainEnd={domainEnd}
        receivedRound={engine.isLive ? engine.receivedRound : (engine.finalRound ?? 0)}
        currentRound={engine.currentRound}
        events={events}
        disabled={seekDisabled}
        onSeek={engine.seek}
      />

      {/* ── Fine strip (R > 200) ──────────────────────────── */}
      {fineWindow !== null && (
        <>
          <TimelineFineCanvas
            window={fineWindow}
            receivedRound={engine.isLive ? engine.receivedRound : (engine.finalRound ?? 0)}
            currentRound={engine.currentRound}
            events={events}
            disabled={seekDisabled}
            onSeek={engine.seek}
          />
          <span className="font-sans text-[11px] text-muted-foreground">
            {t("runView.fineDetail", { from: fmt(fineWindow[0]), to: fmt(fineWindow[1]) })}
          </span>
        </>
      )}

      {/* ── Go-to-round row ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex flex-none items-center gap-[5px]">
          <span className="font-sans text-[11.5px] text-muted-foreground">
            {t("runView.goToRound")}
          </span>
          <Input
            type="number"
            min={0}
            placeholder={t("runView.goToPlaceholder")}
            value={goTo}
            disabled={seekDisabled}
            onChange={(e) => setGoTo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitGoTo();
            }}
            className="h-[26px] w-[76px] px-2 font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={seekDisabled}
            onClick={commitGoTo}
          >
            {t("runView.goToButton")}
          </Button>
        </span>
        <span className="min-w-[120px] flex-1 truncate font-sans text-[11px] text-muted-foreground">
          {t("runView.shortcutHint", { big: fmt(bigStep) })}
        </span>
        <span className="flex flex-none gap-[9px]">
          {(
            [
              ["cambio", "runView.eventLegendChange"],
              ["silencio", "runView.eventLegendSilence"],
              ["fin", "runView.eventLegendEnd"],
            ] as const
          ).map(([kind, key]) => (
            <span
              key={kind}
              className="flex items-center gap-1 font-sans text-[11px] text-muted-foreground"
            >
              <span
                className={cn("size-2 flex-none rounded-[2px]", EVENT_DOT_CLASS[kind])}
                aria-hidden="true"
              />
              {t(key)}
            </span>
          ))}
        </span>
        <span className="flex-none font-mono text-[11px] text-muted-foreground">
          {engine.isLive
            ? t("runView.receivedOfTotal", {
                received: fmt(engine.receivedRound),
                total: fmt(domainEnd),
              })
            : t("runView.totalRounds", {
                count: engine.finalRound ?? 0,
                display: fmt(engine.finalRound ?? 0),
              })}
        </span>
      </div>
    </div>
  );
}
