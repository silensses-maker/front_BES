import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./chunk-load-error";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** Mirrors the error Rspack's JSONP runtime rejects with when a chunk fails. */
function rspackChunkError(): Error {
  const error = new Error(
    "Loading chunk 412 failed.\n(missing: https://example.test/static/js/async/412.js)",
  );
  error.name = "ChunkLoadError";
  return error;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("isChunkLoadError", () => {
  it("detects Rspack's ChunkLoadError by name", () => {
    expect(isChunkLoadError(rspackChunkError())).toBe(true);
  });

  it("detects a failed CSS chunk by its code", () => {
    expect(isChunkLoadError({ code: "CSS_CHUNK_LOAD_FAILED", message: "" })).toBe(true);
  });

  it.each([
    "Loading chunk page-wiki failed.\n(timeout: /static/js/async/page-wiki.js)",
    "Loading CSS chunk 7 failed.\n(/static/css/async/7.css)",
  ])("detects a chunk failure by its message: %s", (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it.each([
    ["a render error", new TypeError("Cannot read properties of undefined (reading 'map')")],
    ["a non-string message", { message: 42 }],
    ["a string", "Loading chunk 1 failed."],
    ["null", null],
    ["undefined", undefined],
  ])("returns false for %s", (_label, error) => {
    expect(isChunkLoadError(error)).toBe(false);
  });
});
