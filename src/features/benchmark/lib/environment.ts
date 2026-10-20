/**
 * Environment recorded with every benchmark result (#126): GPU, CPU, memory, browser, display.
 * Every probe degrades to null / "unavailable" instead of throwing.
 */

export interface GpuInfo {
  /** How the renderer was read: the unmasked debug extension, the basic parameters, or nothing. */
  source: "WEBGL_debug_renderer_info" | "basic" | "unavailable";
  webglVersion: 1 | 2 | null;
  vendor: string | null;
  renderer: string | null;
  maxTextureSize: number | null;
  /** True for software rasterizers (SwiftShader, llvmpipe…): results are not valid. */
  softwareRendering: boolean;
}

export interface UserAgentDataInfo {
  brands: string[];
  mobile: boolean | null;
  platform: string | null;
  platformVersion?: string | null;
  architecture?: string | null;
  bitness?: string | null;
  model?: string | null;
  fullVersionList?: string[];
}

export interface BenchEnvironment {
  gpu: GpuInfo;
  hardwareConcurrency: number | null;
  /** navigator.deviceMemory (GB, rounded and capped by the browser); null when unsupported. */
  deviceMemoryGb: number | null;
  userAgent: string;
  userAgentData: UserAgentDataInfo | null;
  language: string | null;
  timeZone: string | null;
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
  };
  devicePixelRatio: number;
  viewport: { width: number; height: number };
  /** Display refresh estimated from an idle rAF sample (Hz); null when not measured. */
  refreshRateHzEst: number | null;
  crossOriginIsolated: boolean;
  apis: {
    performanceMemory: boolean;
    measureUserAgentSpecificMemory: boolean;
    longTask: boolean;
  };
  hostname: string;
  /** True when the page was opened by an automation driver (navigator.webdriver). */
  webdriver: boolean;
}

const SOFTWARE_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|basic render driver|mesa offscreen/i;

export function isSoftwareRenderer(renderer: string | null): boolean {
  return renderer !== null && SOFTWARE_RENDERER.test(renderer);
}

interface WebGLLike {
  getParameter(p: number): unknown;
  getExtension(name: string): unknown;
  VENDOR: number;
  RENDERER: number;
  MAX_TEXTURE_SIZE: number;
}

/** Reads the GPU from a WebGL context (unmasked when the debug extension is exposed). */
export function readGpuInfo(gl: WebGLLike | null, version: 1 | 2 | null): GpuInfo {
  if (gl === null) {
    return {
      source: "unavailable",
      webglVersion: null,
      vendor: null,
      renderer: null,
      maxTextureSize: null,
      softwareRendering: false,
    };
  }
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const debug = gl.getExtension("WEBGL_debug_renderer_info") as {
    UNMASKED_VENDOR_WEBGL: number;
    UNMASKED_RENDERER_WEBGL: number;
  } | null;
  const unmaskedRenderer = debug ? str(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : null;
  const unmaskedVendor = debug ? str(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) : null;
  const renderer = unmaskedRenderer ?? str(gl.getParameter(gl.RENDERER));
  const vendor = unmaskedVendor ?? str(gl.getParameter(gl.VENDOR));
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  return {
    source: unmaskedRenderer !== null ? "WEBGL_debug_renderer_info" : "basic",
    webglVersion: version,
    vendor,
    renderer,
    maxTextureSize: typeof maxTexture === "number" ? maxTexture : null,
    softwareRendering: isSoftwareRenderer(renderer),
  };
}

function probeGpu(): GpuInfo {
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    const gl = gl2 ?? canvas.getContext("webgl");
    const info = readGpuInfo(gl as WebGLLike | null, gl2 ? 2 : gl ? 1 : null);
    (gl?.getExtension("WEBGL_lose_context") as { loseContext(): void } | null)?.loseContext();
    return info;
  } catch {
    return readGpuInfo(null, null);
  }
}

interface NavigatorUAData {
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

async function probeUserAgentData(): Promise<UserAgentDataInfo | null> {
  const data = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  if (!data) return null;
  const info: UserAgentDataInfo = {
    brands: (data.brands ?? []).map((b) => `${b.brand} ${b.version}`),
    mobile: data.mobile ?? null,
    platform: data.platform ?? null,
  };
  try {
    const high = await data.getHighEntropyValues?.([
      "platformVersion",
      "architecture",
      "bitness",
      "model",
      "fullVersionList",
    ]);
    if (high) {
      const s = (v: unknown) => (typeof v === "string" ? v : null);
      info.platformVersion = s(high.platformVersion);
      info.architecture = s(high.architecture);
      info.bitness = s(high.bitness);
      info.model = s(high.model);
      const list = high.fullVersionList as Array<{ brand: string; version: string }> | undefined;
      if (Array.isArray(list)) info.fullVersionList = list.map((b) => `${b.brand} ${b.version}`);
    }
  } catch {
    // high-entropy hints are optional
  }
  return info;
}

export async function collectEnvironment(
  refreshRateHzEst: number | null,
  longTaskSupported: boolean,
): Promise<BenchEnvironment> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timeZone = null;
  }
  return {
    gpu: probeGpu(),
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    deviceMemoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    userAgent: nav.userAgent,
    userAgentData: await probeUserAgentData(),
    language: nav.language ?? null,
    timeZone,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
    },
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    refreshRateHzEst,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    apis: {
      performanceMemory: "memory" in performance,
      measureUserAgentSpecificMemory: uaMemoryAvailable(),
      longTask: longTaskSupported,
    },
    hostname: location.hostname,
    webdriver: nav.webdriver === true,
  };
}

/** `performance.measureUserAgentSpecificMemory` needs a cross-origin isolated page. */
export function uaMemoryAvailable(): boolean {
  return (
    globalThis.crossOriginIsolated === true &&
    typeof (performance as Performance & { measureUserAgentSpecificMemory?: unknown })
      .measureUserAgentSpecificMemory === "function"
  );
}

export type UaMemoryResult =
  | { status: "ok"; bytes: number }
  | { status: "unavailable" | "timeout" | "error"; bytes: null };

/** Total page memory per the browser (JS + DOM + Wasm…); resolves after the next GC. */
export async function measureUaMemory(timeoutMs: number): Promise<UaMemoryResult> {
  if (!uaMemoryAvailable()) return { status: "unavailable", bytes: null };
  const measure = (
    performance as Performance & {
      measureUserAgentSpecificMemory: () => Promise<{ bytes: number }>;
    }
  ).measureUserAgentSpecificMemory;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const result = await Promise.race([measure.call(performance), timeout]);
    if (result === "timeout") return { status: "timeout", bytes: null };
    return { status: "ok", bytes: result.bytes };
  } catch {
    return { status: "error", bytes: null };
  } finally {
    clearTimeout(timer);
  }
}

/** One-line label of the machine/browser, used to group results. */
export function environmentLabel(
  env: Pick<BenchEnvironment, "gpu" | "hardwareConcurrency" | "userAgentData" | "userAgent">,
): string {
  const browser =
    env.userAgentData?.brands.find((b) => !/not.?a.?brand|chromium/i.test(b)) ??
    env.userAgentData?.brands[0] ??
    env.userAgent;
  const platform = env.userAgentData?.platform ?? "";
  const gpu = env.gpu.renderer ?? "unknown GPU";
  const cores =
    env.hardwareConcurrency !== null ? `${env.hardwareConcurrency} threads` : "? threads";
  return [gpu, cores, platform, browser].filter((p) => p.length > 0).join(" · ");
}
