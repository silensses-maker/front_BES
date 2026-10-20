import type { BenchRuntime } from "@/features/benchmark/lib/runtime";

/**
 * Virtual clock for the benchmark harness tests (#126): `requestFrame` callbacks run on
 * `frame()`, sleeps resolve when the clock passes their deadline. `run()` drives a promise to
 * completion frame by frame, flushing microtasks in between.
 */
export class FakeBenchRuntime implements BenchRuntime {
  time = 0;
  frameMs: number;
  private frames = new Map<number, (ts: number) => void>();
  private nextHandle = 1;
  private timers: Array<{ at: number; resolve: () => void }> = [];

  constructor(frameMs = 1000 / 60) {
    this.frameMs = frameMs;
  }

  now = (): number => this.time;

  sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const abort = () => {
        const error = new Error("Benchmark aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      const timer = { at: this.time + Math.max(0, ms), resolve };
      this.timers.push(timer);
      signal?.addEventListener(
        "abort",
        () => {
          this.timers = this.timers.filter((t) => t !== timer);
          abort();
        },
        { once: true },
      );
    });

  requestFrame = (callback: (ts: number) => void): number => {
    const handle = this.nextHandle++;
    this.frames.set(handle, callback);
    return handle;
  };

  cancelFrame = (handle: number): void => {
    this.frames.delete(handle);
  };

  get pendingFrames(): number {
    return this.frames.size;
  }

  /** Advances one frame: the clock moves by `ms`, due sleeps resolve, rAF callbacks run. */
  frame(ms = this.frameMs): void {
    this.time += ms;
    const due = this.timers.filter((t) => t.at <= this.time);
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.resolve();
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    for (const cb of callbacks) cb(this.time);
  }

  /** Runs frames until `promise` settles (or `maxFrames` is reached). */
  async run<T>(promise: Promise<T>, maxFrames = 200_000): Promise<T> {
    let settled = false;
    const tracked = promise.finally(() => {
      settled = true;
    });
    for (let i = 0; i < maxFrames && !settled; i++) {
      this.frame();
      for (let k = 0; k < 5; k++) await Promise.resolve();
    }
    return tracked;
  }
}
