import { useCallback, useEffect, useRef, useState } from "react";
import { useRoundAggregatesStore } from "@/entities/simulation";
import { useTranslation } from "@/shared/i18n";
import { formatNumber } from "@/shared/lib/format-number";
import { findNearbyEvent, type RoundEvent } from "../lib/round-events";
import {
  eventColor,
  fineWindowFor,
  prepareCanvas,
  readTimelineColors,
  roundAtX,
  TIMELINE_PAD,
} from "./timeline-canvas-utils";

interface TimelineOverviewCanvasProps {
  domainEnd: number;
  receivedRound: number;
  currentRound: number;
  events: RoundEvent[];
  disabled: boolean;
  onSeek: (round: number) => void;
}

/**
 * Overview timeline (mockup "Línea de tiempo"): received shading, hatched
 * not-yet-received region, mean±spread band, dashed participation line, event
 * ticks, fine-window rectangle (R>200) and the playhead. Custom 2D canvas —
 * the drag-to-seek interaction and hatching are not an ECharts shape.
 * Colors are read from theme tokens at draw time; redraws on data changes,
 * resize and theme flips.
 */
export function TimelineOverviewCanvas({
  domainEnd,
  receivedRound,
  currentRound,
  events,
  disabled,
  onSeek,
}: TimelineOverviewCanvasProps) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const version = useRoundAggregatesStore((s) => s.version);

  const [hover, setHover] = useState<{ round: number; x: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prepared = prepareCanvas(canvas);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const colors = readTimelineColors();

    const iw = width - TIMELINE_PAD * 2;
    const top = 4;
    const trackH = height - 19;
    const X = (round: number) => TIMELINE_PAD + iw * (domainEnd ? round / domainEnd : 0);
    const Y = (value: number) => top + trackH * (1 - Math.max(0, Math.min(1, value)));
    const received = Math.min(domainEnd, receivedRound);

    // Track background + received shading
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = colors.mutedForeground;
    ctx.fillRect(TIMELINE_PAD, top, iw, trackH);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = colors.primary;
    ctx.fillRect(TIMELINE_PAD, top, X(received) - TIMELINE_PAD, trackH);
    ctx.globalAlpha = 1;

    // Hatched not-yet-received region
    if (received < domainEnd) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(X(received), top, width - TIMELINE_PAD - X(received), trackH);
      ctx.clip();
      ctx.globalAlpha = 0.15;
      ctx.strokeStyle = colors.mutedForeground;
      ctx.lineWidth = 1;
      for (let o = -trackH; o < iw + trackH; o += 7) {
        ctx.beginPath();
        ctx.moveTo(X(received) + o, top + trackH);
        ctx.lineTo(X(received) + o + trackH, top);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Band (mean ± spread/2), mean line, participation line — sparse-tolerant
    const { aggregates } = useRoundAggregatesStore.getState();
    const stride = Math.max(1, Math.ceil(received / 600));
    const points: Array<{ round: number; mean: number; spread: number; part: number }> = [];
    for (let r = 0; r <= received; r += stride) {
      const agg = aggregates[r];
      if (agg !== undefined) {
        points.push({
          round: r,
          mean: agg.meanPublic,
          spread: agg.spread,
          part: agg.participation,
        });
      }
    }
    if (points.length > 1) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = colors.primary;
      ctx.beginPath();
      for (const p of points) ctx.lineTo(X(p.round), Y(p.mean + p.spread / 2));
      for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i];
        if (p) ctx.lineTo(X(p.round), Y(p.mean - p.spread / 2));
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(X(p.round), Y(p.mean));
        else ctx.lineTo(X(p.round), Y(p.mean));
      });
      ctx.stroke();

      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = colors.warn;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(X(p.round), Y(p.part));
        else ctx.lineTo(X(p.round), Y(p.part));
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Event ticks + top dots
    for (const event of events) {
      if (event.round > received) continue;
      const color = eventColor(event.kind, colors);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(X(event.round), top);
      ctx.lineTo(X(event.round), top + trackH);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(X(event.round), top + 2.5, 2.5, 0, 7);
      ctx.fill();
    }

    // Fine-window rectangle (only when the fine strip is shown)
    if (domainEnd > 200) {
      const [from, to] = fineWindowFor(currentRound, domainEnd);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = colors.foreground;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.max(TIMELINE_PAD, X(from) - 1),
        top + 1,
        Math.max(3, X(to) - X(from) + 2),
        trackH - 2,
      );
      ctx.globalAlpha = 1;
    }

    // Playhead with knob
    const cx = X(Math.min(currentRound, domainEnd));
    ctx.strokeStyle = colors.foreground;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, top - 2);
    ctx.lineTo(cx, top + trackH + 2);
    ctx.stroke();
    ctx.fillStyle = colors.foreground;
    ctx.beginPath();
    ctx.arc(cx, top + trackH + 2, 3.2, 0, 7);
    ctx.fill();

    // Axis labels: 0 / mid / end
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = colors.mutedForeground;
    ctx.textAlign = "left";
    ctx.fillText("0", TIMELINE_PAD, height - 4);
    ctx.textAlign = "center";
    ctx.fillText(
      formatNumber(Math.round(domainEnd / 2), i18n.language),
      TIMELINE_PAD + iw / 2,
      height - 4,
    );
    ctx.textAlign = "right";
    ctx.fillText(formatNumber(domainEnd, i18n.language), width - TIMELINE_PAD, height - 4);
  }, [domainEnd, receivedRound, currentRound, events, i18n.language]);

  // Redraw on data changes + resize + theme flips
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
      if (!canvas) return 0;
      return roundAtX(clientX, canvas.getBoundingClientRect(), 0, domainEnd);
    },
    [domainEnd],
  );

  const hoverEvent = hover === null ? null : findNearbyEvent(events, hover.round, domainEnd);
  const hoverSuffix =
    hoverEvent !== null
      ? ` · ${t(hoverEvent.labelKey as Parameters<typeof t>[0], hoverEvent.params)}`
      : hover !== null && hover.round > receivedRound
        ? ` · ${t("runView.hoverNotReceived")}`
        : "";

  return (
    <div className="relative h-[52px]">
      <canvas
        ref={canvasRef}
        aria-label={t("runView.timelineAria")}
        className="absolute inset-0 block h-full w-full cursor-col-resize"
        onPointerDown={(e) => {
          if (disabled) return;
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onSeek(roundAt(e.clientX));
        }}
        onPointerMove={(e) => {
          const round = roundAt(e.clientX);
          const rect = e.currentTarget.getBoundingClientRect();
          setHover({ round, x: e.clientX - rect.left });
          if (draggingRef.current && !disabled) onSeek(round);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
          setHover(null);
        }}
      />
      {hover !== null && (
        <div
          className="pointer-events-none absolute bottom-[calc(100%+6px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 font-sans text-[11px] text-background"
          style={{ left: hover.x }}
        >
          {t("runView.roundLabel", { round: formatNumber(hover.round, i18n.language) })}
          {hoverSuffix}
        </div>
      )}
    </div>
  );
}
