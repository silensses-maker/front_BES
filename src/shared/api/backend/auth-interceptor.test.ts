import axios, { type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({
  auth: {
    currentUser: null as null | { getIdToken: (force?: boolean) => Promise<string> },
  },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

// ─── Shared imports ───────────────────────────────────────────────────────────

// Import once at the top level so the interceptors registered by auth-interceptor.ts
// are applied to the same backendClient instance throughout all tests.
import { auth } from "@/shared/api/firebase";
import "./auth-interceptor";
import { backendClient } from "./client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSuccessAdapter(data: unknown = {}) {
  return vi.fn().mockResolvedValue({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  });
}

function make401Error(config: InternalAxiosRequestConfig) {
  return new axios.AxiosError("Unauthorized", "ERR_BAD_REQUEST", config, null, {
    status: 401,
    statusText: "Unauthorized",
    data: { error: "unauthorized", message: "Token expired" },
    headers: {},
    config,
  });
}

function make403Error(config: InternalAxiosRequestConfig) {
  return new axios.AxiosError("Forbidden", "ERR_BAD_REQUEST", config, null, {
    status: 403,
    statusText: "Forbidden",
    data: { error: "forbidden", message: "Admin role required" },
    headers: {},
    config,
  });
}

// ─── Tests — request interceptor ─────────────────────────────────────────────

describe("auth-interceptor — request interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: resetting mock property between tests
    (auth as any).currentUser = null;
    delete backendClient.defaults.adapter;
  });

  it("attaches Authorization Bearer header when currentUser has a token", async () => {
    const mockGetIdToken = vi.fn().mockResolvedValue("test-token-123");
    // biome-ignore lint/suspicious/noExplicitAny: mutating mock object property
    (auth as any).currentUser = { getIdToken: mockGetIdToken };

    const mockAdapter = makeSuccessAdapter();
    backendClient.defaults.adapter = mockAdapter;

    await backendClient.get("/test");

    const calledConfig = mockAdapter.mock.calls[0]?.[0] as InternalAxiosRequestConfig;
    expect(calledConfig.headers.Authorization).toBe("Bearer test-token-123");
  });

  it("does not set Authorization header when currentUser is null", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mutating mock object property
    (auth as any).currentUser = null;

    const mockAdapter = makeSuccessAdapter();
    backendClient.defaults.adapter = mockAdapter;

    await backendClient.get("/test");

    const calledConfig = mockAdapter.mock.calls[0]?.[0] as InternalAxiosRequestConfig;
    expect(calledConfig.headers.Authorization).toBeUndefined();
  });
});

// ─── Tests — response interceptor (401 retry) ────────────────────────────────

describe("auth-interceptor — response interceptor (401 retry)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: resetting mock property between tests
    (auth as any).currentUser = null;
    delete backendClient.defaults.adapter;
  });

  it("calls getIdToken(true) and retries when the backend responds with 401", async () => {
    const mockGetIdToken = vi
      .fn()
      .mockResolvedValueOnce("old-token") // request interceptor on first attempt
      .mockResolvedValueOnce("refreshed-token"); // force-refresh in response interceptor
    // biome-ignore lint/suspicious/noExplicitAny: mutating mock object property
    (auth as any).currentUser = { getIdToken: mockGetIdToken };

    let callCount = 0;
    const mockAdapter = vi.fn().mockImplementation(async (cfg: InternalAxiosRequestConfig) => {
      callCount++;
      if (callCount === 1) {
        throw make401Error(cfg);
      }
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config: cfg };
    });

    backendClient.defaults.adapter = mockAdapter;

    const result = await backendClient.get("/test");

    expect(result.data).toEqual({ ok: true });
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it("propagates the error when the retry also fails", async () => {
    const mockGetIdToken = vi.fn().mockResolvedValue("any-token");
    // biome-ignore lint/suspicious/noExplicitAny: mutating mock object property
    (auth as any).currentUser = { getIdToken: mockGetIdToken };

    const mockAdapter = vi.fn().mockImplementation(async (cfg: InternalAxiosRequestConfig) => {
      throw make401Error(cfg);
    });

    backendClient.defaults.adapter = mockAdapter;

    await expect(backendClient.get("/test")).rejects.toThrow();
    // getIdToken(true) was called exactly once (during the single retry attempt)
    expect(mockGetIdToken).toHaveBeenCalledWith(true);
  });

  it("does not retry non-401 errors", async () => {
    const mockGetIdToken = vi.fn().mockResolvedValue("token");
    // biome-ignore lint/suspicious/noExplicitAny: mutating mock object property
    (auth as any).currentUser = { getIdToken: mockGetIdToken };

    const mockAdapter = vi.fn().mockImplementation(async (cfg: InternalAxiosRequestConfig) => {
      throw make403Error(cfg);
    });

    backendClient.defaults.adapter = mockAdapter;

    await expect(backendClient.get("/test")).rejects.toThrow();
    // force-refresh must NOT be called for non-401 errors
    expect(mockGetIdToken).not.toHaveBeenCalledWith(true);
  });
});
