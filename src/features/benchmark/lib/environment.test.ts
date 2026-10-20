import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectEnvironment,
  environmentLabel,
  isSoftwareRenderer,
  measureUaMemory,
  readGpuInfo,
  uaMemoryAvailable,
} from "./environment";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeGl(params: Record<number, unknown>, debug: boolean) {
  return {
    VENDOR: 1,
    RENDERER: 2,
    MAX_TEXTURE_SIZE: 3,
    getParameter: (p: number) => params[p],
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info" && debug
        ? { UNMASKED_VENDOR_WEBGL: 10, UNMASKED_RENDERER_WEBGL: 11 }
        : null,
  };
}

describe("readGpuInfo", () => {
  it("prefers the unmasked renderer of the debug extension", () => {
    const gl = fakeGl(
      { 1: "WebKit", 2: "WebKit WebGL", 3: 16384, 10: "NVIDIA", 11: "RTX 3060" },
      true,
    );
    expect(readGpuInfo(gl, 2)).toEqual({
      source: "WEBGL_debug_renderer_info",
      webglVersion: 2,
      vendor: "NVIDIA",
      renderer: "RTX 3060",
      maxTextureSize: 16384,
      softwareRendering: false,
    });
  });

  it("falls back to the basic parameters, then to unavailable", () => {
    const gl = fakeGl({ 1: "Mozilla", 2: "Radeon R9 200 Series", 3: "x" }, false);
    expect(readGpuInfo(gl, 1)).toMatchObject({
      source: "basic",
      vendor: "Mozilla",
      renderer: "Radeon R9 200 Series",
      maxTextureSize: null,
    });
    expect(readGpuInfo(null, null)).toMatchObject({ source: "unavailable", renderer: null });
  });

  it("flags software rasterizers", () => {
    const gl = fakeGl(
      { 10: "Google Inc.", 11: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))" },
      true,
    );
    expect(readGpuInfo(gl, 2).softwareRendering).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("Microsoft Basic Render Driver")).toBe(true);
    expect(isSoftwareRenderer("Apple M2")).toBe(false);
    expect(isSoftwareRenderer(null)).toBe(false);
  });
});

describe("collectEnvironment", () => {
  it("records the browser, display and API availability", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: "UA/1",
      language: "es-CO",
      hardwareConcurrency: 8,
      deviceMemory: 8,
      webdriver: false,
      userAgentData: {
        brands: [{ brand: "Google Chrome", version: "130" }],
        mobile: false,
        platform: "Windows",
        getHighEntropyValues: async () => ({
          platformVersion: "15.0.0",
          architecture: "x86",
          bitness: "64",
          model: "",
          fullVersionList: [{ brand: "Google Chrome", version: "130.0.6723.70" }],
        }),
      },
    });
    const env = await collectEnvironment(60, true);
    expect(env.hardwareConcurrency).toBe(8);
    expect(env.deviceMemoryGb).toBe(8);
    expect(env.userAgent).toBe("UA/1");
    expect(env.userAgentData).toMatchObject({
      brands: ["Google Chrome 130"],
      platform: "Windows",
      platformVersion: "15.0.0",
      architecture: "x86",
      bitness: "64",
      fullVersionList: ["Google Chrome 130.0.6723.70"],
    });
    expect(env.refreshRateHzEst).toBe(60);
    expect(env.apis.longTask).toBe(true);
    expect(env.apis.measureUserAgentSpecificMemory).toBe(false);
    expect(env.viewport.width).toBe(window.innerWidth);
    expect(env.devicePixelRatio).toBe(window.devicePixelRatio);
    expect(env.gpu.source).toBeDefined();
  });

  it("tolerates missing client hints and high-entropy failures", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "UA/2",
      userAgentData: {
        brands: undefined,
        getHighEntropyValues: async () => Promise.reject(new Error("x")),
      },
    });
    const env = await collectEnvironment(null, false);
    expect(env.userAgentData).toEqual({ brands: [], mobile: null, platform: null });
    expect(env.hardwareConcurrency).toBeNull();
    expect(env.deviceMemoryGb).toBeNull();
    vi.stubGlobal("navigator", { userAgent: "UA/3" });
    expect((await collectEnvironment(null, false)).userAgentData).toBeNull();
  });
});

describe("measureUaMemory", () => {
  it("is unavailable outside a cross-origin isolated page", async () => {
    expect(uaMemoryAvailable()).toBe(false);
    expect(await measureUaMemory(10)).toEqual({ status: "unavailable", bytes: null });
  });

  it("measures, times out or reports an error when isolated", async () => {
    vi.stubGlobal("crossOriginIsolated", true);
    const perf = performance as Performance & { measureUserAgentSpecificMemory?: unknown };
    try {
      perf.measureUserAgentSpecificMemory = async () => ({ bytes: 1234 });
      expect(uaMemoryAvailable()).toBe(true);
      expect(await measureUaMemory(1_000)).toEqual({ status: "ok", bytes: 1234 });
      perf.measureUserAgentSpecificMemory = () => new Promise(() => {});
      expect(await measureUaMemory(5)).toEqual({ status: "timeout", bytes: null });
      perf.measureUserAgentSpecificMemory = async () => {
        throw new Error("SecurityError");
      };
      expect(await measureUaMemory(1_000)).toEqual({ status: "error", bytes: null });
    } finally {
      delete perf.measureUserAgentSpecificMemory;
    }
  });
});

describe("environmentLabel", () => {
  it("joins GPU, threads, platform and browser", () => {
    expect(
      environmentLabel({
        gpu: { renderer: "RTX 3060" } as never,
        hardwareConcurrency: 12,
        userAgent: "UA",
        userAgentData: {
          brands: ["Not)A;Brand 99", "Google Chrome 130", "Chromium 130"],
          mobile: false,
          platform: "Windows",
        },
      }),
    ).toBe("RTX 3060 · 12 threads · Windows · Google Chrome 130");
    expect(
      environmentLabel({
        gpu: { renderer: null } as never,
        hardwareConcurrency: null,
        userAgent: "Mozilla/5.0 Firefox",
        userAgentData: null,
      }),
    ).toBe("unknown GPU · ? threads · Mozilla/5.0 Firefox");
  });
});
