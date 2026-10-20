import { useEffect, useState } from "react";

/**
 * Collapses bursts of `schedule()` calls into a single `flush()` on the next animation frame
 * (#129: live ingest can deliver several rounds per frame; charts repaint at most once).
 */
export function createFrameCoalescer(
  flush: () => void,
  raf: (cb: FrameRequestCallback) => number = (cb) => requestAnimationFrame(cb),
  caf: (handle: number) => void = (handle) => cancelAnimationFrame(handle),
): { schedule: () => void; cancel: () => void; readonly pending: boolean } {
  let handle: number | null = null;
  return {
    schedule() {
      if (handle !== null) return;
      handle = raf(() => {
        handle = null;
        flush();
      });
    },
    cancel() {
      if (handle === null) return;
      caf(handle);
      handle = null;
    },
    get pending() {
      return handle !== null;
    },
  };
}

type Subscribe = (listener: () => void) => () => void;

function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) =>
    Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/**
 * Reads a snapshot of one or more external stores and re-renders with a new one AT MOST once per
 * animation frame, however many store updates arrive in between. `read` must be cheap; the
 * snapshot is compared shallowly. `subscribes` and `read` should be stable (module-level).
 */
export function useFrameCoalesced<T>(subscribes: readonly Subscribe[], read: () => T): T {
  const [snapshot, setSnapshot] = useState(read);

  useEffect(() => {
    const coalescer = createFrameCoalescer(() => {
      const next = read();
      setSnapshot((previous) => (shallowEqual(previous, next) ? previous : next));
    });
    const unsubscribes = subscribes.map((subscribe) => subscribe(() => coalescer.schedule()));
    // A store may have changed between the first render and this effect
    coalescer.schedule();
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      coalescer.cancel();
    };
  }, [subscribes, read]);

  return snapshot;
}
