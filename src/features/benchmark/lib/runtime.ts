/**
 * Time and frame primitives the harness runs on (#126). Injected so the runner and the
 * recorder can be unit-tested with a fake clock; the browser implementation is the default.
 */
export interface BenchRuntime {
  now(): number;
  /** Resolves after `ms`; rejects with an AbortError when `signal` aborts first. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(handle: number): void;
}

export function abortError(): Error {
  const error = new Error("Benchmark aborted");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const browserRuntime: BenchRuntime = {
  now: () => performance.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      const timer = setTimeout(
        () => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        },
        Math.max(0, ms),
      );
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    }),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};
