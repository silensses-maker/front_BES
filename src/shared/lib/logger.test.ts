import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Tests ───────────────────────────────────────────────────────────────────

// isDev is evaluated at module load time (`import.meta.env.MODE === "development"`),
// so each test stubs MODE and resets the module registry before re-importing the
// logger to get a fresh evaluation of isDev.

describe("logger.error", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("calls console.error with formatted [context]: error when isDev=true", async () => {
    vi.stubEnv("MODE", "development");
    const { logger } = await import("./logger");

    logger.error("myContext", new Error("boom"));

    // biome-ignore lint/suspicious/noConsole: asserting on spied console.error — not a direct call
    expect(console.error).toHaveBeenCalledWith("[myContext]:", expect.any(Error));
  });

  it("does not call console.error when isDev=false", async () => {
    vi.stubEnv("MODE", "production");
    const { logger } = await import("./logger");

    logger.error("myContext", new Error("silent"));

    // biome-ignore lint/suspicious/noConsole: asserting on spied console.error — not a direct call
    expect(console.error).not.toHaveBeenCalled();
  });

  it("accepts error of type unknown and safely logs it", async () => {
    vi.stubEnv("MODE", "development");
    const { logger } = await import("./logger");

    const unknownError: unknown = { code: 42, message: "unknown shape" };
    logger.error("ctx", unknownError);

    // biome-ignore lint/suspicious/noConsole: asserting on spied console.error — not a direct call
    expect(console.error).toHaveBeenCalledWith("[ctx]:", unknownError);
  });

  it("handles null error without throwing", async () => {
    vi.stubEnv("MODE", "development");
    const { logger } = await import("./logger");

    expect(() => logger.error("ctx", null)).not.toThrow();
    // biome-ignore lint/suspicious/noConsole: asserting on spied console.error — not a direct call
    expect(console.error).toHaveBeenCalledWith("[ctx]:", null);
  });

  it("handles undefined error without throwing", async () => {
    vi.stubEnv("MODE", "development");
    const { logger } = await import("./logger");

    expect(() => logger.error("ctx", undefined)).not.toThrow();
    // biome-ignore lint/suspicious/noConsole: asserting on spied console.error — not a direct call
    expect(console.error).toHaveBeenCalledWith("[ctx]:", undefined);
  });
});
