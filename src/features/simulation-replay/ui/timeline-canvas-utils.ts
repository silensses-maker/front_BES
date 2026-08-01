/** Shared drawing helpers for the timeline canvases (overview + fine strip). */

import type { RoundEventKind } from "../lib/round-events";

export const TIMELINE_PAD = 9;

export interface TimelineColors {
  primary: string;
  ok: string;
  warn: string;
  foreground: string;
  mutedForeground: string;
}

/** Reads theme tokens at draw time so the canvas follows light/dark switches. */
export function readTimelineColors(): TimelineColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    primary: read("--primary", "#4f6bd8"),
    ok: read("--ok", "#2f9e6a"),
    warn: read("--warn", "#c2871f"),
    foreground: read("--foreground", "#1e2748"),
    mutedForeground: read("--muted-foreground", "#586282"),
  };
}

export function eventColor(kind: RoundEventKind, colors: TimelineColors): string {
  if (kind === "fin") return colors.ok;
  if (kind === "silencio") return colors.warn;
  return colors.primary;
}

/** Scales a canvas backing store to its CSS size × devicePixelRatio. Returns
 *  the 2D context ready to draw in CSS pixels, or null when not renderable. */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return null;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

/** Round at pointer x, for a canvas mapping [pad, width−pad] → [r0, r1]. */
export function roundAtX(clientX: number, rect: DOMRect, r0: number, r1: number): number {
  const fraction =
    (clientX - rect.left - TIMELINE_PAD) / Math.max(1, rect.width - TIMELINE_PAD * 2);
  const clamped = Math.max(0, Math.min(1, fraction));
  return Math.round(r0 + clamped * (r1 - r0));
}

/** Mockup's fine-strip window: ±max(10, R/40) around the viewed round. */
export function fineWindowFor(currentRound: number, domainEnd: number): [number, number] {
  const half = Math.max(10, Math.round(domainEnd / 40));
  let from = currentRound - half;
  let to = currentRound + half;
  if (from < 0) {
    to -= from;
    from = 0;
  }
  if (to > domainEnd) {
    from -= to - domainEnd;
    to = domainEnd;
  }
  return [Math.max(0, from), to];
}
