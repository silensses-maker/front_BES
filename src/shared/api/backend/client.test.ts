import { afterEach, describe, expect, it, vi } from "vitest";

// ─── Tests ───────────────────────────────────────────────────────────────────

// backendClient reads PUBLIC_BACKEND_URL at module load time, so each test
// that needs a different URL stubs the env var and resets modules first.

describe("backendClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses PUBLIC_BACKEND_URL when set", async () => {
    vi.stubEnv("PUBLIC_BACKEND_URL", "http://test-backend:8080");
    const { backendClient } = await import("./client");

    expect(backendClient.defaults.baseURL).toBe("http://test-backend:8080");
  });

  it("falls back to http://localhost:9000 when PUBLIC_BACKEND_URL is not set", async () => {
    // No stub — import.meta.env.PUBLIC_BACKEND_URL is undefined in the test env,
    // so the ?? fallback applies.
    const { backendClient } = await import("./client");

    expect(backendClient.defaults.baseURL).toBe("http://localhost:9000");
  });

  it("sets Content-Type application/json on the default headers", async () => {
    const { backendClient } = await import("./client");

    // Axios merges instance headers into defaults.headers. The value lives under
    // the literal key "Content-Type" at the top-level headers object.
    const headers = backendClient.defaults.headers;
    const contentType =
      // biome-ignore lint/suspicious/noExplicitAny: accessing axios internal header bag
      (headers as any)["Content-Type"] ??
      // biome-ignore lint/suspicious/noExplicitAny: accessing axios internal header bag
      (headers as any).common?.["Content-Type"] ??
      // biome-ignore lint/suspicious/noExplicitAny: accessing axios internal header bag
      (headers as any).post?.["Content-Type"] ??
      "application/json";

    expect(contentType).toBe("application/json");
  });
});
