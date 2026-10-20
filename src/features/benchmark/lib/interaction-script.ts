import type { BenchCosmograph } from "@/shared/lib/bench-probe";
import { createRandom } from "./prng";

/**
 * Scripted camera interaction (#126): a deterministic, timed sequence of zooms and pans through
 * the Cosmograph API. Step `k` fires at `k × stepMs` from the phase start and animates for
 * `animationMs`; the cycle is fit → zoom in → pan → pan → zoom out → pan, with pan targets
 * drawn from the seeded PRNG, so every run (and every machine) replays the same camera path.
 */

export type InteractionStep =
  | { kind: "fit" }
  | { kind: "zoom"; factor: number }
  | { kind: "pan"; pointIndex: number; scale: number };

export const INTERACTION_ANIMATION_MS = 600;

const ZOOM_IN = 4;
const PAN_SCALE = 3;

export function buildInteractionScript(
  seed: number,
  points: number,
  steps: number,
): InteractionStep[] {
  const random = createRandom(seed);
  const pan = (): InteractionStep => ({
    kind: "pan",
    pointIndex: points > 0 ? Math.floor(random() * points) : 0,
    scale: PAN_SCALE,
  });
  const out: InteractionStep[] = [];
  for (let k = 0; k < steps; k++) {
    switch (k % 6) {
      case 0:
        out.push({ kind: "fit" });
        break;
      case 1:
        out.push({ kind: "zoom", factor: ZOOM_IN });
        break;
      case 4:
        out.push({ kind: "zoom", factor: 1 / ZOOM_IN });
        break;
      default:
        out.push(pan());
    }
  }
  return out;
}

export function applyInteractionStep(
  cosmograph: BenchCosmograph,
  step: InteractionStep,
  animationMs = INTERACTION_ANIMATION_MS,
): void {
  switch (step.kind) {
    case "fit":
      cosmograph.fitView(animationMs);
      break;
    case "zoom": {
      const current = cosmograph.getZoomLevel();
      if (current !== undefined) cosmograph.setZoomLevel(current * step.factor, animationMs);
      break;
    }
    case "pan":
      cosmograph.zoomToPoint(step.pointIndex, animationMs, step.scale, true);
      break;
  }
}
