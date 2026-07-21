import { describe, expect, it } from "vitest";
import type { BackendError, BackendErrorCode } from "@/shared/api/backend";
import { getBackendErrorCode, isBackendError, isErrorCode } from "./backend-error";

// ─── Types ───────────────────────────────────────────────────────────────────

type MockAxiosError<T = unknown> = {
  isAxiosError: boolean;
  response?: {
    data: T;
  };
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeAxiosError<T>(data: T): MockAxiosError<T> {
  return {
    isAxiosError: true,
    response: { data },
  };
}

const validBackendErrorData: BackendError = {
  error: "unauthorized",
  message: "You are not authorized to perform this action.",
};

const validAxiosBackendError: MockAxiosError<BackendError> = makeAxiosError(validBackendErrorData);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("isBackendError", () => {
  it("returns true for AxiosError with valid BackendError shape", () => {
    expect(isBackendError(validAxiosBackendError)).toBe(true);
  });

  it("returns false for a plain Error (non-AxiosError)", () => {
    expect(isBackendError(new Error("plain error"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isBackendError(null)).toBe(false);
  });

  it("returns false for a primitive string", () => {
    expect(isBackendError("some string")).toBe(false);
  });

  it("returns false for AxiosError without a response", () => {
    const errorWithoutResponse: MockAxiosError = {
      isAxiosError: true,
    };
    expect(isBackendError(errorWithoutResponse)).toBe(false);
  });

  it("returns false for AxiosError whose response data is missing the error field", () => {
    const error = makeAxiosError<Record<string, unknown>>({ message: "only message" });
    expect(isBackendError(error)).toBe(false);
  });

  it("returns false for AxiosError whose response data is missing the message field", () => {
    const error = makeAxiosError<Record<string, unknown>>({ error: "only error" });
    expect(isBackendError(error)).toBe(false);
  });

  it("returns false for AxiosError whose error field is not a string", () => {
    const error = makeAxiosError<Record<string, unknown>>({
      error: 42,
      message: "a message",
    });
    expect(isBackendError(error)).toBe(false);
  });

  it("returns false for AxiosError whose message field is not a string", () => {
    const error = makeAxiosError<Record<string, unknown>>({
      error: "unauthorized",
      message: true,
    });
    expect(isBackendError(error)).toBe(false);
  });

  it("returns false for an object that has isAxiosError set to false", () => {
    const notAxios: MockAxiosError<BackendError> = {
      isAxiosError: false,
      response: { data: validBackendErrorData },
    };
    expect(isBackendError(notAxios)).toBe(false);
  });
});

describe("getBackendErrorCode", () => {
  it("returns the code when error is a valid BackendError with a known code", () => {
    const knownCodes: BackendErrorCode[] = [
      "unauthorized",
      "forbidden",
      "not_found",
      "invalid_body",
      "usage_limit_exceeded",
      "rate_limited",
    ];

    for (const code of knownCodes) {
      const error = makeAxiosError<BackendError>({ error: code, message: "desc" });
      expect(getBackendErrorCode(error)).toBe(code);
    }
  });

  it("returns null when the error is not a BackendError", () => {
    expect(getBackendErrorCode(new Error("plain"))).toBeNull();
  });

  it("returns null when the error code is not in BACKEND_ERROR_CODES", () => {
    const error = makeAxiosError<BackendError>({
      error: "unknown_custom_code",
      message: "something went wrong",
    });
    expect(getBackendErrorCode(error)).toBeNull();
  });

  it("returns null when the error code is an empty string", () => {
    const error = makeAxiosError<BackendError>({
      error: "",
      message: "empty code",
    });
    expect(getBackendErrorCode(error)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(getBackendErrorCode(null)).toBeNull();
  });
});

describe("isErrorCode", () => {
  it("returns true when the error code matches the provided code", () => {
    const error = makeAxiosError<BackendError>({
      error: "forbidden",
      message: "Access denied.",
    });
    expect(isErrorCode(error, "forbidden")).toBe(true);
  });

  it("returns false when the error code does not match the provided code", () => {
    const error = makeAxiosError<BackendError>({
      error: "not_found",
      message: "Resource not found.",
    });
    expect(isErrorCode(error, "forbidden")).toBe(false);
  });

  it("returns false when the error is not a BackendError", () => {
    expect(isErrorCode(new Error("plain"), "unauthorized")).toBe(false);
  });

  it("returns false when the error code is unknown even if compared to a known code", () => {
    const error = makeAxiosError<BackendError>({
      error: "some_unknown_code",
      message: "?",
    });
    expect(isErrorCode(error, "not_found")).toBe(false);
  });
});
