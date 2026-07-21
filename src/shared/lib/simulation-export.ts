/**
 * Generic JSON envelope utilities for simulation config export/import.
 * This module is intentionally domain-free: it uses Record<string, unknown>
 * so it can live in shared/ without importing from features/.
 * The feature hook (use-simulation-config.ts) applies domain types on top.
 */

export interface SimConfigEnvelope {
  createdAt: string;
  appVersion: string;
  runId?: string;
  payload: Record<string, unknown>;
}

export function buildEnvelope(payload: Record<string, unknown>, runId?: string): SimConfigEnvelope {
  return {
    createdAt: new Date().toISOString(),
    appVersion: (import.meta.env.npm_package_version as string | undefined) ?? "unknown",
    ...(runId !== undefined ? { runId } : {}),
    payload,
  };
}

export function downloadEnvelopeJson(envelope: SimConfigEnvelope, networkType: string): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `bes-config-${networkType}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
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
