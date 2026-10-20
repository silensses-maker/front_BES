import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MathJaxApi } from "./load-mathjax";

// ─── Helpers ─────────────────────────────────────────────────────────────────

type LoaderModule = typeof import("./load-mathjax");

/** Fresh module per test: the shared load promise and the typeset queue are module state. */
async function freshLoader(): Promise<LoaderModule> {
  vi.resetModules();
  return import("./load-mathjax");
}

/** Scripts the loader appended (kept in a detached container, so nothing is fetched). */
function captureScripts(): HTMLScriptElement[] {
  const container = document.createElement("div");
  const scripts: HTMLScriptElement[] = [];
  vi.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
    scripts.push(node as unknown as HTMLScriptElement);
    return container.appendChild(node);
  });
  return scripts;
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What the bundled tex-svg build leaves on window once it has run. */
function fakeMathJax(startup: Promise<unknown> = Promise.resolve()) {
  return {
    startup: { promise: startup },
    typesetPromise: vi.fn<MathJaxApi["typesetPromise"]>(() => Promise.resolve()),
    typesetClear: vi.fn<MathJaxApi["typesetClear"]>(),
  };
}

/** Simulates the script running: it replaces the config with the API, then fires `load`. */
function runScript(script: HTMLScriptElement, api: unknown) {
  window.MathJax = api;
  script.dispatchEvent(new Event("load"));
}

function connectedElement(): HTMLElement {
  const el = document.createElement("article");
  document.body.appendChild(el);
  return el;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  delete window.MathJax;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.MathJax;
  document.body.innerHTML = "";
});

describe("loadMathJax", () => {
  it("sets the config, injects the script once and shares one promise between callers", async () => {
    const { loadMathJax, mathJaxConfig, MATHJAX_SRC } = await freshLoader();
    const scripts = captureScripts();

    const first = loadMathJax();
    const second = loadMathJax();

    expect(second).toBe(first);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute("src")).toBe(MATHJAX_SRC);
    expect(scripts[0]?.async).toBe(true);
    // The config must be in place before the script runs
    expect(window.MathJax).toEqual(mathJaxConfig());
  });

  it("resolves only after MathJax's startup promise has settled", async () => {
    const { loadMathJax } = await freshLoader();
    const scripts = captureScripts();
    const startup = deferred();
    const api = fakeMathJax(startup.promise);
    const onResolved = vi.fn();

    void loadMathJax().then(onResolved);
    runScript(scripts[0]!, api);
    await flush();
    expect(onResolved).not.toHaveBeenCalled();

    startup.resolve();
    await flush();
    expect(onResolved).toHaveBeenCalledWith(api);
  });

  it("rejects on a script error, removes the tag and retries on the next call", async () => {
    const { loadMathJax } = await freshLoader();
    const scripts = captureScripts();

    const failed = loadMathJax();
    scripts[0]?.dispatchEvent(new Event("error"));
    await expect(failed).rejects.toThrow("Failed to load /mathjax-tex-svg.js");
    expect(scripts[0]?.parentNode).toBeNull();

    const retry = loadMathJax();
    expect(retry).not.toBe(failed);
    expect(scripts).toHaveLength(2);
    const api = fakeMathJax();
    runScript(scripts[1]!, api);
    await expect(retry).resolves.toBe(api);
  });

  it("rejects when the script loads but does not define MathJax (e.g. an HTML fallback)", async () => {
    const { loadMathJax } = await freshLoader();
    const scripts = captureScripts();

    const failed = loadMathJax();
    scripts[0]?.dispatchEvent(new Event("load"));

    await expect(failed).rejects.toThrow("did not define MathJax");
    expect(scripts[0]?.parentNode).toBeNull();
  });

  it("rejects when MathJax's startup fails", async () => {
    const { loadMathJax } = await freshLoader();
    const scripts = captureScripts();
    const startup = Promise.reject(new Error("startup failed"));
    startup.catch(() => {});

    const failed = loadMathJax();
    runScript(scripts[0]!, fakeMathJax(startup));

    await expect(failed).rejects.toThrow("startup failed");
  });

  it("reuses a MathJax that is already on the page without injecting a script", async () => {
    const { loadMathJax } = await freshLoader();
    const scripts = captureScripts();
    const api = fakeMathJax();
    window.MathJax = api;

    await expect(loadMathJax()).resolves.toBe(api);
    expect(scripts).toHaveLength(0);
  });

  it("rejects outside a browser document instead of throwing", async () => {
    const { loadMathJax } = await freshLoader();
    vi.stubGlobal("document", undefined);

    await expect(loadMathJax()).rejects.toThrow("browser document");
  });
});

describe("mathJaxConfig", () => {
  it("keeps the tex/svg options index.html used and disables the startup typeset", async () => {
    const { mathJaxConfig } = await freshLoader();

    expect(mathJaxConfig()).toEqual({
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
    });
    expect(mathJaxConfig()).not.toBe(mathJaxConfig());
  });
});

describe("isMathJaxApi", () => {
  it.each([
    ["the config object", { tex: {}, svg: {} }],
    ["an API without startup", { typesetPromise: () => {}, typesetClear: () => {} }],
    ["null", null],
    ["a string", "MathJax"],
  ])("returns false for %s", async (_label, value) => {
    const { isMathJaxApi } = await freshLoader();
    expect(isMathJaxApi(value)).toBe(false);
  });

  it("returns true for the started MathJax global", async () => {
    const { isMathJaxApi } = await freshLoader();
    expect(isMathJaxApi(fakeMathJax())).toBe(true);
  });
});

describe("typesetMath", () => {
  it("loads MathJax, then typesets the elements still in the document", async () => {
    const { typesetMath } = await freshLoader();
    const scripts = captureScripts();
    const api = fakeMathJax();
    const live = connectedElement();
    const detached = document.createElement("article");

    const done = typesetMath([live, detached]);
    await flush();
    runScript(scripts[0]!, api);
    await done;

    expect(api.typesetPromise).toHaveBeenCalledOnce();
    expect(api.typesetPromise).toHaveBeenCalledWith([live]);
  });

  it("neither loads nor typesets when no element is in the document", async () => {
    const { typesetMath } = await freshLoader();
    const scripts = captureScripts();

    await typesetMath([document.createElement("article")]);

    expect(scripts).toHaveLength(0);
  });

  it("runs one typeset at a time", async () => {
    const { typesetMath } = await freshLoader();
    const api = fakeMathJax();
    const firstTypeset = deferred();
    api.typesetPromise.mockImplementationOnce(() => firstTypeset.promise);
    window.MathJax = api;
    const el = connectedElement();

    const first = typesetMath([el]);
    const second = typesetMath([el]);
    await flush();
    expect(api.typesetPromise).toHaveBeenCalledTimes(1);

    firstTypeset.resolve();
    await Promise.all([first, second]);
    expect(api.typesetPromise).toHaveBeenCalledTimes(2);
  });

  it("rejects when MathJax cannot be loaded, and later typesets still run", async () => {
    const { typesetMath } = await freshLoader();
    const scripts = captureScripts();
    const el = connectedElement();

    const failed = typesetMath([el]);
    await flush();
    scripts[0]?.dispatchEvent(new Event("error"));
    await expect(failed).rejects.toThrow("Failed to load");

    const api = fakeMathJax();
    const retried = typesetMath([el]);
    await flush();
    runScript(scripts[1]!, api);
    await retried;
    expect(api.typesetPromise).toHaveBeenCalledWith([el]);
  });
});

describe("clearMath", () => {
  it("clears the math inside the elements once MathJax is loaded", async () => {
    const { clearMath } = await freshLoader();
    const api = fakeMathJax();
    window.MathJax = api;
    const el = document.createElement("article");

    await clearMath([el]);

    expect(api.typesetClear).toHaveBeenCalledWith([el]);
  });

  it("is a no-op before MathJax has loaded", async () => {
    const { clearMath } = await freshLoader();
    window.MathJax = { tex: {}, svg: {} };

    await expect(clearMath([document.createElement("article")])).resolves.toBeUndefined();
  });
});
