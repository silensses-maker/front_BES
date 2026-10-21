import { isBackendError } from "@/shared/lib/backend-error";

/**
 * What went wrong with a polarization request (#129), for the message the view shows. There is no
 * client-side fallback: without the server there are no values.
 *  - `disabled`: 404 — the server has polarization disabled (APP_POLARIZATION=false) or predates it;
 *  - `unavailable`: 503 — its pol_measures worker could not start, crashed, timed out or is busy;
 *  - `invalid`: 400 / 422 — the server rejected the measure, its parameters or k;
 *  - `error`: anything else (network, 401 after the token refresh, 5xx).
 */
export type PolarizationErrorKind = "disabled" | "unavailable" | "invalid" | "error";

export interface PolarizationErrorInfo {
  kind: PolarizationErrorKind;
  /** HTTP status, null without an answer. */
  status: number | null;
  /** The server's `message`, when it sent the JSON error body. */
  message: string | null;
}

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("response" in error)) return null;
  const status = (error as { response?: { status?: unknown } }).response?.status;
  return typeof status === "number" ? status : null;
}

export function polarizationErrorOf(error: unknown): PolarizationErrorInfo {
  const status = statusOf(error);
  const message = isBackendError(error) ? (error.response?.data.message ?? null) : null;
  let kind: PolarizationErrorKind = "error";
  if (status === 404) kind = "disabled";
  else if (status === 503) kind = "unavailable";
  else if (status === 400 || status === 422) kind = "invalid";
  return { kind, status, message };
}

/** i18n key of the message the view shows for a failed request (`invalid` has its own). */
export function polarizationErrorKey(error: PolarizationErrorInfo | null): string {
  if (error?.kind === "disabled") return "polarization.errorDisabled";
  if (error?.kind === "unavailable") return "polarization.errorUnavailable";
  return "polarization.errorGeneric";
}
