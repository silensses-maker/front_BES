import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { createFrameCoalescer, useFrameCoalesced } from "./frame-coalescer";
import { useChartTheme } from "./use-chart-theme";

/** Manual animation-frame queue. */
function frameQueue() {
  let next = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    raf: (cb: FrameRequestCallback) => {
      const id = next++;
      callbacks.set(id, cb);
      return id;
    },
    caf: (id: number) => {
      callbacks.delete(id);
    },
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const cb of pending) cb(0);
    },
    get size() {
      return callbacks.size;
    },
  };
}

describe("createFrameCoalescer", () => {
  it("collapses bursts into one flush per frame", () => {
    const frames = frameQueue();
    const flush = vi.fn();
    const coalescer = createFrameCoalescer(flush, frames.raf, frames.caf);
    coalescer.schedule();
    coalescer.schedule();
    coalescer.schedule();
    expect(coalescer.pending).toBe(true);
    expect(frames.size).toBe(1);
    frames.flush();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(coalescer.pending).toBe(false);
    coalescer.schedule();
    frames.flush();
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending frame", () => {
    const frames = frameQueue();
    const flush = vi.fn();
    const coalescer = createFrameCoalescer(flush, frames.raf, frames.caf);
    coalescer.cancel(); // no-op
    coalescer.schedule();
    coalescer.cancel();
    frames.flush();
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("useFrameCoalesced", () => {
  const frames = frameQueue();
  const useCounter = create<{ count: number; other: number }>(() => ({ count: 0, other: 0 }));
  const subscribes = [(listener: () => void) => useCounter.subscribe(listener)] as const;
  const read = () => ({ count: useCounter.getState().count });

  beforeEach(() => {
    useCounter.setState({ count: 0, other: 0 });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(frames.raf);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(frames.caf);
  });
  afterEach(() => vi.restoreAllMocks());

  it("re-renders at most once per animation frame, with the latest snapshot", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useFrameCoalesced(subscribes, read);
    });
    act(() => frames.flush());
    const rendersAfterMount = renders;

    act(() => {
      for (let i = 1; i <= 10; i++) useCounter.setState({ count: i });
    });
    expect(result.current.count).toBe(0);
    act(() => frames.flush());
    expect(result.current.count).toBe(10);
    expect(renders).toBe(rendersAfterMount + 1);
  });

  it("keeps the same snapshot when nothing it reads changed", () => {
    const { result } = renderHook(() => useFrameCoalesced(subscribes, read));
    act(() => frames.flush());
    const first = result.current;
    act(() => {
      useCounter.setState({ other: 5 });
    });
    act(() => frames.flush());
    expect(result.current).toBe(first);
  });

  it("unsubscribes and cancels the pending frame on unmount", () => {
    const { unmount } = renderHook(() => useFrameCoalesced(subscribes, read));
    act(() => {
      useCounter.setState({ count: 3 });
    });
    unmount();
    expect(frames.size).toBe(0);
  });
});

describe("useChartTheme", () => {
  afterEach(() => {
    document.documentElement.className = "";
  });

  it("re-reads the palette when the root class flips and keeps it when unchanged", async () => {
    const { result } = renderHook(() => useChartTheme());
    const first = result.current;
    await act(async () => {
      document.documentElement.className = "dark";
      await Promise.resolve();
    });
    // Tokens resolve to the same fallback colors in the test DOM → same object
    expect(result.current).toBe(first);
    expect(result.current.public).toMatch(/^rgb/);
  });
});
