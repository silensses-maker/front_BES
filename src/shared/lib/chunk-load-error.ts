/**
 * True when `error` comes from the bundler failing to fetch a lazily loaded
 * chunk — typically a stale tab still pointing at the hashed files of a
 * previous deploy, or a dropped connection. Reloading picks up the current
 * index.html and its chunk names, so the UI offers a reload instead of a
 * generic error.
 *
 * Rspack's runtime names JS failures `ChunkLoadError` ("Loading chunk 123
 * failed.") and tags CSS ones with `code: "CSS_CHUNK_LOAD_FAILED"` ("Loading
 * CSS chunk 123 failed.").
 */
export function isChunkLoadError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const { name, code, message } = error as { name?: unknown; code?: unknown; message?: unknown };
  if (name === "ChunkLoadError" || code === "CSS_CHUNK_LOAD_FAILED") return true;

  return typeof message === "string" && /loading (css )?chunk \S+ failed/i.test(message);
}
