/**
 * On-demand MathJax v3 (#130). The combined `tex-svg` build (~2 MB, served
 * unhashed from public/) used to be a script tag in index.html, downloaded on
 * every page; only the Wiki renders TeX, so it is now injected the first time
 * the Wiki asks for it.
 */

/** The parts of the MathJax v3 global this app calls. */
export interface MathJaxApi {
  startup: { promise: Promise<unknown> };
  typesetPromise: (elements?: Element[]) => Promise<unknown>;
  typesetClear: (elements?: Element[]) => void;
}

declare global {
  interface Window {
    /** The config object before the script runs; the MathJax API afterwards. */
    MathJax?: unknown;
  }
}

export const MATHJAX_SRC = "/mathjax-tex-svg.js";

/**
 * Read by the script when it runs. Same tex/svg options index.html used to
 * set; `startup.typeset` is off because the Wiki typesets its own article —
 * the startup pass would otherwise typeset whatever page is on screen when
 * the script finishes loading.
 */
export function mathJaxConfig() {
  return {
    tex: {
      inlineMath: [
        ["\\(", "\\)"],
        ["$", "$"],
      ],
      displayMath: [
        ["$$", "$$"],
        ["\\[", "\\]"],
      ],
    },
    svg: { fontCache: "global" },
    startup: { typeset: false },
  };
}

export function isMathJaxApi(value: unknown): value is MathJaxApi {
  if (typeof value !== "object" || value === null) return false;
  const { startup, typesetPromise, typesetClear } = value as Partial<MathJaxApi>;
  return (
    typeof typesetPromise === "function" &&
    typeof typesetClear === "function" &&
    typeof startup?.promise?.then === "function"
  );
}

let loading: Promise<MathJaxApi> | null = null;

/**
 * Loads MathJax once and resolves when its startup has finished. Concurrent
 * and later calls share the same promise; after a failure (network error, or
 * a response that did not define MathJax) the script tag is removed and the
 * next call tries again. Rejects outside a browser document (SSR, node tests).
 */
export function loadMathJax(): Promise<MathJaxApi> {
  if (loading) return loading;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("MathJax needs a browser document"));
  }

  const promise = new Promise<MathJaxApi>((resolve, reject) => {
    if (isMathJaxApi(window.MathJax)) {
      const api = window.MathJax;
      api.startup.promise.then(() => resolve(api), reject);
      return;
    }

    window.MathJax = mathJaxConfig();
    const script = document.createElement("script");
    script.src = MATHJAX_SRC;
    script.async = true;
    const fail = (error: Error) => {
      script.remove();
      reject(error);
    };
    script.addEventListener("error", () => fail(new Error(`Failed to load ${MATHJAX_SRC}`)), {
      once: true,
    });
    script.addEventListener(
      "load",
      () => {
        const api = window.MathJax;
        if (!isMathJaxApi(api)) {
          fail(new Error(`${MATHJAX_SRC} loaded but did not define MathJax`));
          return;
        }
        api.startup.promise.then(() => resolve(api), reject);
      },
      { once: true },
    );
    document.head.appendChild(script);
  });

  loading = promise;
  // Forget a failed attempt so the next call retries (registered first: runs before callers' handlers).
  promise.catch(() => {
    if (loading === promise) loading = null;
  });
  return promise;
}

// MathJax 3.2's typesetPromise/typesetClear share one document state and must not overlap
// (StrictMode double effects, a language change mid-typeset), so every call is chained here.
let queue: Promise<unknown> = Promise.resolve();

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

/**
 * Typesets the TeX inside `elements`, loading MathJax first if needed.
 * Elements no longer in the document (the page unmounted meanwhile) are
 * skipped, and nothing is loaded when none is left.
 */
export function typesetMath(elements: readonly Element[]): Promise<void> {
  return enqueue(async () => {
    if (!elements.some((el) => el.isConnected)) return;
    const api = await loadMathJax();
    const connected = elements.filter((el) => el.isConnected);
    if (connected.length > 0) await api.typesetPromise(connected);
  });
}

/** Drops MathJax's records of the math inside `elements` (call when that content goes away). */
export function clearMath(elements: readonly Element[]): Promise<void> {
  return enqueue(async () => {
    const api = typeof window === "undefined" ? undefined : window.MathJax;
    if (isMathJaxApi(api)) api.typesetClear([...elements]);
  });
}
