/**
 * Generic JSON envelope utilities for simulation config export/import.
 * This module is intentionally domain-free: it uses Record<string, unknown>
 * so it can live in shared/ without importing from features/.
 * The feature hook (use-simulation-config.ts) applies domain types on top.
 */

export interface SimConfigEnvelope {
  createdAt: string;
  /** Version of the app that wrote the file (`package.json` version, compiled in, #127). */
  appVersion: string;
  /** Run launched with this configuration (exports from the run detail, #127). */
  runId?: string;
  /**
   * Seed of that run (generated runs): the `seed` sent, or the one the backend drew when none was
   * — the value that replays it (#127). An exact decimal string because the backend column is
   * 64-bit; it is also written into the payload when the wizard can hold it (see buildRunEnvelope).
   */
  seed?: string;
  payload: Record<string, unknown>;
}

/** A decimal 64-bit integer as the backend prints it (optional minus sign, no leading zeros). */
const DECIMAL_INTEGER = /^-?(0|[1-9]\d*)$/;

export function buildEnvelope(payload: Record<string, unknown>, runId?: string): SimConfigEnvelope {
  return {
    createdAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    ...(runId !== undefined ? { runId } : {}),
    payload,
  };
}

/**
 * A generated payload with `seed` set to the run's seed, when the wizard can hold it exactly: a
 * whole number in `[0, 2^53 − 1]` (the wizard's seed range). Any other payload or seed — custom
 * runs, runs created before #127 whose stored value is outside that range — is returned as is.
 */
export function withRunSeed(
  payload: Record<string, unknown>,
  seed: string,
): Record<string, unknown> {
  if (payload.networkType !== "generated" || !DECIMAL_INTEGER.test(seed)) return payload;
  const value = Number(seed);
  if (!Number.isSafeInteger(value) || value < 0) return payload;
  return { ...payload, seed: value };
}

/**
 * Envelope exported from the run detail (#127): the configuration the run was launched with, its
 * `runId` and, for generated runs, its `seed`, also written into the payload (withRunSeed) so that
 * loading the file and launching it replays the run — a random-seed launch included. `seed` is
 * omitted when the backend reports none (custom runs, older backends) or something that is not a
 * decimal integer.
 */
export function buildRunEnvelope(
  payload: Record<string, unknown>,
  run: { runId: string; seed?: string | null },
): SimConfigEnvelope {
  const seed =
    typeof run.seed === "string" && DECIMAL_INTEGER.test(run.seed) ? run.seed : undefined;
  return {
    createdAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    runId: run.runId,
    ...(seed !== undefined ? { seed } : {}),
    payload: seed !== undefined ? withRunSeed(payload, seed) : payload,
  };
}

/**
 * Downloads the envelope as `bes-config-{networkType}-{runId}.json` — or `-{timestamp}` when it
 * belongs to no run (wizard exports) — and returns that file name (for the toast).
 */
export function downloadEnvelopeJson(envelope: SimConfigEnvelope, networkType: string): string {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json",
  });
  const fileName = `bes-config-${networkType}-${envelope.runId ?? Date.now()}.json`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}

/**
 * Wraps FileReader in a Promise.
 * Resolves with the parsed JSON object.
 * Rejects with the original SyntaxError if the content is not valid JSON,
 * or with an Error if the FileReader itself fails.
 */
export function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        resolve(parsed);
      } catch (syntaxError) {
        reject(syntaxError);
      }
    };
    reader.onerror = () => {
      reject(new Error("FileReader failed to read the file"));
    };
    reader.readAsText(file);
  });
}

/**
 * Parses an unknown value into a SimConfigEnvelope.
 * Returns null if the shape is invalid (missing payload or payload.networkType).
 *
 * Accepts both enveloped files ({ createdAt, payload: { networkType, ... } })
 * and bare payload objects ({ networkType, ... }) produced by legacy export.
 */
export function parseEnvelope(raw: unknown): SimConfigEnvelope | null {
  if (raw === null || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;

  // Enveloped format
  if (
    typeof obj.createdAt === "string" &&
    obj.payload !== null &&
    typeof obj.payload === "object"
  ) {
    const payload = obj.payload as Record<string, unknown>;
    if (typeof payload.networkType !== "string") return null;
    return {
      createdAt: obj.createdAt,
      appVersion: typeof obj.appVersion === "string" ? obj.appVersion : "unknown",
      ...(typeof obj.runId === "string" ? { runId: obj.runId } : {}),
      ...(typeof obj.seed === "string" ? { seed: obj.seed } : {}),
      payload,
    };
  }

  // Bare payload (legacy / direct export of SimFormValues)
  if (typeof obj.networkType === "string") {
    return {
      createdAt: new Date().toISOString(),
      appVersion: "unknown",
      payload: obj,
    };
  }

  return null;
}
