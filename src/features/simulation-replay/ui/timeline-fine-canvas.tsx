import { useCallback, useEffect, useRef } from "react";
import { useRoundAggregatesStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import type { RoundEvent } from "../lib/round-events";
import {
  eventColor,
  prepareCanvas,
  readTimelineColors,
  roundAtX,
  TIMELINE_PAD,
} from "./timeline-canvas-utils";

interface TimelineFineCanvasProps {
  window: [number, number];
  receivedRound: number;
  currentRound: number;
  events: RoundEvent[];
  disabled: boolean;
  onSeek: (round: number) => void;
}

/**
 * Fine-detail strip (mockup, shown when R > 200): a zoomed window around the
 * viewed round with per-round tick marks, the mean line, event ticks and the
 * playhead — drag for 1-round precision.
 */
export function TimelineFineCanvas({
  window: fineWindow,
  receivedRound,
  currentRound,
  events,
  disabled,
  onSeek,
}: TimelineFineCanvasProps) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const version = useRoundAggregatesStore((s) => s.version);
  const [from, to] = fineWindow;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const colors = readTimelineColors();

    const iw = width - TIMELINE_PAD * 2;
    const span = Math.max(1, to - from);
    const X = (round: number) => TIMELINE_PAD + iw * ((round - from) / span);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = colors.mutedForeground;
    ctx.fillRect(TIMELINE_PAD, 3, iw, height - 14);
    ctx.globalAlpha = 1;

    // Per-round tick marks when there is room (mockup: spacing ≥ 3.5px)
    if (iw / span >= 3.5) {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = colors.mutedForeground;
      ctx.lineWidth = 1;
      for (let r = from; r <= to && r <= receivedRound; r++) {
        const big = r % 10 === 0;
        ctx.beginPath();
        ctx.moveTo(X(r), height - 11);
        ctx.lineTo(X(r), height - 11 - (big ? 7 : 4));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Mean line over the window
    const { aggregates } = useRoundAggregatesStore.getState();
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let started = false;
    for (let r = from; r <= Math.min(to, receivedRound); r++) {
      const agg = aggregates[r];
      if (agg === undefined) continue;
      const y = 3 + (height - 14) * (1 - agg.meanPublic);
      if (started) ctx.lineTo(X(r), y);
      else {
        ctx.moveTo(X(r), y);
        started = true;
      }
    }
    ctx.stroke();

    // Event ticks inside the window
    for (const event of events) {
      if (event.round < from || event.round > to || event.round > receivedRound) continue;
      ctx.strokeStyle = eventColor(event.kind, colors);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(X(event.round), 3);
      ctx.lineTo(X(event.round), height - 11);
      ctx.stroke();
    }

    // Playhead
    const cx = X(currentRound);
    ctx.strokeStyle = colors.foreground;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, 1);
    ctx.lineTo(cx, height - 9);
    ctx.stroke();

    // Window bounds
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = colors.mutedForeground;
    ctx.textAlign = "left";
    ctx.fillText(formatNumber(from, i18n.language), TIMELINE_PAD, height - 1);
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(to, i18n.language), width - TIMELINE_PAD, height - 1);
  }, [from, to, receivedRound, currentRound, events, i18n.language]);

  useEffect(() => {
    draw();
  }, [draw]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the mutable-buffer redraw signal
  useEffect(() => {
    draw();
  }, [version, draw]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver(() => draw());
    resizeObserver.observe(canvas);
    const themeObserver = new MutationObserver(() => draw());
    themeObserver.observe(document.documentElement, { attributes: true });
    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [draw]);

  const roundAt = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return from;
      return roundAtX(clientX, canvas.getBoundingClientRect(), from, to);
    },
    [from, to],
  );

  return (
    <div className="relative h-[30px]">
      <canvas
        ref={canvasRef}
        aria-label={t("runView.fineTimelineAria")}
        className="absolute inset-0 block h-full w-full cursor-col-resize"
        onPointerDown={(e) => {
          if (disabled) return;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onSeek(roundAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (draggingRef.current && !disabled) onSeek(roundAt(e.clientX));
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
      />
    </div>
  );
}
