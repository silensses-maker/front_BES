import type { AxiosError } from "axios";
import type { BackendError, BackendErrorCode } from "@/shared/api/backend";

export function isBackendError(error: unknown): error is AxiosError<BackendError> {
  if (
    typeof error !== "object" ||
    error === null ||
    !("isAxiosError" in error) ||
    !(error as AxiosError).isAxiosError
  ) {
    return false;
  }

  const axiosError = error as AxiosError<unknown>;
  const data = axiosError.response?.data;

  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    "message" in data &&
    typeof (data as Record<string, unknown>).error === "string" &&
    typeof (data as Record<string, unknown>).message === "string"
  );
}

const BACKEND_ERROR_CODES: ReadonlySet<BackendErrorCode> = new Set([
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid_body",
  "usage_limit_exceeded",
  "rate_limited",
]);

function isKnownCode(code: string): code is BackendErrorCode {
  return BACKEND_ERROR_CODES.has(code as BackendErrorCode);
}

export function getBackendErrorCode(error: unknown): BackendErrorCode | null {
  if (!isBackendError(error)) return null;
  const code = error.response?.data.error;
  if (typeof code === "string" && isKnownCode(code)) return code;
  return null;
}

export function isErrorCode(error: unknown, code: BackendErrorCode): boolean {
  return getBackendErrorCode(error) === code;
}
