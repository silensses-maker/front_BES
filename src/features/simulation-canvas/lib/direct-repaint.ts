import {
  type CosmosDirect,
  disableDirectRepaint,
  isDirectRepaintDisabled,
  resolveCosmosDirect,
} from "./cosmos-direct";
import {
  buildColorBuffer,
  buildSizeBuffer,
  type ColorBy,
  type FrameBeliefs,
  type PointTables,
} from "./point-colors";
import {
  decideRepaint,
  INITIAL_REPAINT_CAP,
  type RepaintCapState,
  recordRepaintCost,
} from "./repaint-cap";

/**
 * The canvas' per-round repaint through cosmos.gl buffers (#142), outside React so it can be
 * tested without WebGL.
 *
 * Modes:
 * - `pending`: no cosmos.gl instance yet. The canvas passes Cosmograph its static colour config
 *   (initial belief, uniform size) — the same as before any round is on screen.
 * - `direct`: every repaint fills the colour/size buffers and pushes them to cosmos.gl. The
 *   canvas keeps its Cosmograph props static, so Cosmograph never recomputes them per round.
 * - `fallback`: the direct push is unavailable (internals differ or a push was rejected): the
 *   canvas hands Cosmograph the `*ByFn` callbacks, as before #142, for the rest of the session.
 *
 * Re-push points — where Cosmograph may draw its own colours again:
 * - `graphRebuilt` ({@link DirectRepaintController.attach}): Cosmograph uploaded the data and
 *   computed its own colours (a new cosmos.gl instance after a data change);
 * - `onConfigUpdated` ({@link DirectRepaintController.configUpdated}): after any config change it
 *   applied (clustering, hide links, freeze…), the buffers are re-pushed if cosmos.gl no longer
 *   draws ours. With static colour props Cosmograph leaves them alone (selection greyout, hover,
 *   clustering and link changes do not touch point colours), so this is a guard, not a hot path.
 * Cosmograph's own colours (its continuous initial-belief scale) are kept as `baseColors` and
 * pushed while there is no frame to colour from (and the mode is not "strategy").
 */

export type RepaintMode = "pending" | "direct" | "fallback";

/** What the canvas wants on screen. Compared by identity (frame object, tables object). */
export interface RepaintInputs {
  tables: PointTables | null;
  colorBy: ColorBy;
  frame: FrameBeliefs | null;
  /** Round of `frame` (reporting only). */
  round: number | null;
}

export interface RepaintReport {
  round: number | null;
  /** Buffer build (ms). */
  buildMs: number;
  /** Push to cosmos.gl (ms). */
  pushMs: number;
}

export interface DirectRepaintOptions {
  onModeChange: (mode: RepaintMode) => void;
  /** After every direct repaint (bench instrumentation). */
  onRepaint?: (report: RepaintReport) => void;
  /** When the cap skipped a round on the canvas. */
  onSkip?: (round: number | null) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

function sameInputs(a: RepaintInputs | null, b: RepaintInputs): boolean {
  return a !== null && a.tables === b.tables && a.colorBy === b.colorBy && a.frame === b.frame;
}

export class DirectRepaintController {
  private modeValue: RepaintMode;
  private direct: CosmosDirect | null = null;
  private inputs: RepaintInputs | null = null;
  private painted: RepaintInputs | null = null;
  private colors: Float32Array = new Float32Array(0);
  private sizes: Float32Array = new Float32Array(0);
  private baseColors: Float32Array | null = null;
  private cap: RepaintCapState = INITIAL_REPAINT_CAP;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly options: DirectRepaintOptions;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<DirectRepaintOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<DirectRepaintOptions["clearTimer"]>;

  constructor(options: DirectRepaintOptions) {
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    this.modeValue = isDirectRepaintDisabled() ? "fallback" : "pending";
  }

  get mode(): RepaintMode {
    return this.modeValue;
  }

  /** The repaint cap's current state (bench/HUD reporting). */
  get capState(): RepaintCapState {
    return this.cap;
  }

  /**
   * Cosmograph rebuilt the graph (its `onGraphRebuilt`): resolves the direct push on `instance`
   * and paints the latest inputs. Returns false when the instance is not available yet (the
   * caller retries on the next frame).
   */
  attach(instance: unknown): boolean {
    if (this.modeValue === "fallback") return true;
    if (instance === undefined || instance === null) return false;
    const resolution = resolveCosmosDirect(instance);
    if (resolution.status !== "ready") {
      // After a rebuild cosmos.gl must exist: a missing instance means the internals changed.
      this.fail(resolution.status === "unsupported" ? resolution.reason : "no cosmos.gl instance");
      return true;
    }
    this.direct = resolution.direct;
    this.painted = null;
    // A rebuild that kept the points (links only) leaves our colours in place: keep the base.
    // (Called from inside Cosmograph's own update: nothing may throw out of here.)
    try {
      if (!resolution.direct.holdsColors(this.colors)) {
        this.baseColors = this.readBaseColors() ?? this.baseColors;
      }
    } catch (err) {
      this.fail(err);
      return true;
    }
    this.setMode("direct");
    this.paintNow();
    return true;
  }

  /** The Cosmograph instance went away (unmount, new network): stop pushing to it. */
  detach(): void {
    this.cancelTimer();
    this.direct = null;
    this.painted = null;
    this.baseColors = null;
    this.cap = INITIAL_REPAINT_CAP;
    if (this.modeValue === "direct") this.setMode("pending");
  }

  /** Cosmograph applied a config change: re-push if it replaced our buffers. */
  configUpdated(): void {
    const direct = this.direct;
    if (this.modeValue !== "direct" || direct === null || this.painted === null) return;
    let colorsKept: boolean;
    try {
      colorsKept = direct.holdsColors(this.colors);
      if (colorsKept && direct.holdsSizes(this.sizes)) return;
    } catch (err) {
      this.fail(err);
      return;
    }
    // Cosmograph drew its own colours: with the static colour props those are the base colours.
    if (!colorsKept) this.baseColors = this.readBaseColors() ?? this.baseColors;
    this.paintNow();
  }

  /**
   * New inputs from the canvas. A new frame during auto-advance goes through the repaint cap;
   * everything else (seek, manual step, colour mode, network) paints at once.
   */
  update(inputs: RepaintInputs, autoAdvancing: boolean): void {
    this.inputs = inputs;
    if (this.modeValue !== "direct" || sameInputs(this.painted, inputs)) return;
    const onlyFrameChanged =
      this.painted !== null &&
      this.painted.tables === inputs.tables &&
      this.painted.colorBy === inputs.colorBy;
    const decision = onlyFrameChanged
      ? decideRepaint(this.cap, this.now(), autoAdvancing)
      : ({ paint: true } as const);
    if (decision.paint) {
      this.paintNow();
      return;
    }
    this.options.onSkip?.(inputs.round);
    if (this.timer === null) {
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.paintNow();
      }, decision.retryInMs);
    }
  }

  /** Auto-advance stopped (end of playback, pause): the latest round is painted exactly. */
  flush(): void {
    if (this.modeValue !== "direct" || this.inputs === null) return;
    if (!sameInputs(this.painted, this.inputs)) this.paintNow();
  }

  dispose(): void {
    this.detach();
  }

  private setMode(mode: RepaintMode): void {
    if (this.modeValue === mode) return;
    this.modeValue = mode;
    this.options.onModeChange(mode);
  }

  private fail(reason: unknown): void {
    disableDirectRepaint(reason);
    this.cancelTimer();
    this.direct = null;
    this.setMode("fallback");
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** Cosmograph's own colours, when cosmos.gl holds one colour per point of the current tables. */
  private readBaseColors(): Float32Array | null {
    const tables = this.inputs?.tables;
    if (!this.direct || !tables) return null;
    try {
      const colors = this.direct.copyColors();
      return colors.length === tables.count * 4 ? colors : null;
    } catch {
      return null;
    }
  }

  private fillBuffers(inputs: RepaintInputs, tables: PointTables): void {
    const owned = inputs.frame !== null || inputs.colorBy === "estr";
    if (!owned && this.baseColors?.length === this.colors.length) {
      this.colors.set(this.baseColors);
    } else {
      // Without a snapshot of Cosmograph's own colours, the initial beliefs on the opinion
      // palette stand in for them.
      buildColorBuffer(this.colors, tables, owned ? inputs.colorBy : "pub", inputs.frame);
    }
    buildSizeBuffer(this.sizes, tables, inputs.frame);
  }

  private paintNow(): void {
    this.cancelTimer();
    const direct = this.direct;
    const inputs = this.inputs;
    const tables = inputs?.tables;
    if (this.modeValue !== "direct" || direct === null || !inputs || !tables) return;
    // cosmos.gl still holds another network (or no data yet): nothing to paint onto.
    if (direct.pointCount() !== tables.count) return;
    if (this.colors.length !== tables.count * 4) this.colors = new Float32Array(tables.count * 4);
    if (this.sizes.length !== tables.count) this.sizes = new Float32Array(tables.count);

    const start = this.now();
    let built: number;
    try {
      this.fillBuffers(inputs, tables);
      built = this.now();
      direct.push(this.colors, this.sizes);
    } catch (err) {
      // Never let a failed repaint escape into Cosmograph's own update (it would abort it).
      this.fail(err);
      return;
    }
    const pushed = this.now();
    this.painted = inputs;
    this.cap = recordRepaintCost(this.cap, pushed - start, pushed);
    this.options.onRepaint?.({
      round: inputs.round,
      buildMs: built - start,
      pushMs: pushed - built,
    });
  }
}
