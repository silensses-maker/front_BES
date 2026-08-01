/**
 * Pure keyboard decoding for the run viewer (mockup shortcuts):
 * ←/→ ±1 (Shift ×10) · PgUp/PgDn ±max(10, R/20) · Home/End · Space play ·
 * `,`/`.` events · Esc restores a maximized panel. Ignored while typing.
 */

export type HotkeyAction =
  | { type: "step"; delta: number }
  | { type: "home" }
  | { type: "end" }
  | { type: "toggle-play" }
  | { type: "event"; dir: 1 | -1 }
  | { type: "escape" };

export interface HotkeyInput {
  key: string;
  shiftKey: boolean;
  /** Lowercased tagName of the event target. */
  targetTag: string;
  /** Timeline domain end — sizes the PgUp/PgDn jump. */
  totalRounds: number;
}

const TYPING_TAGS = new Set(["input", "select", "textarea"]);

export function decodeRunHotkey(input: HotkeyInput): HotkeyAction | null {
  if (TYPING_TAGS.has(input.targetTag)) return null;

  const bigStep = Math.max(10, Math.round(input.totalRounds / 20));
  const stepSize = input.shiftKey ? 10 : 1;

  switch (input.key) {
    case "ArrowLeft":
      return { type: "step", delta: -stepSize };
    case "ArrowRight":
      return { type: "step", delta: stepSize };
    case "PageUp":
      return { type: "step", delta: -bigStep };
    case "PageDown":
      return { type: "step", delta: bigStep };
    case "Home":
      return { type: "home" };
    case "End":
      return { type: "end" };
    case " ":
      return { type: "toggle-play" };
    case ",":
      return { type: "event", dir: -1 };
    case ".":
      return { type: "event", dir: 1 };
    case "Escape":
      return { type: "escape" };
    default:
      return null;
  }
}
