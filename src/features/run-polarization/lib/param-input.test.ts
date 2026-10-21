import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PolarizationCatalog, PolarizationNumberParam } from "@/shared/api/backend";
import {
  alienationLabel,
  formatMeasureValue,
  formatParamValue,
  formatShapeValue,
  isInRange,
  paramSymbol,
  parseParamInput,
  rangeText,
} from "./param-input";
import { polarizationErrorKey, polarizationErrorOf } from "./polarization-error";

/** The catalog the real worker answered (pol_measures @ 0e05564), as the backend serves it. */
const catalog: PolarizationCatalog = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "__fixtures__", "pol-measures-catalog.json"),
    "utf8",
  ),
);

function numberParam(measureId: string, name: string): PolarizationNumberParam {
  const spec = catalog.measures
    .find((m) => m.id === measureId)
    ?.params.find((p) => p.name === name);
  if (spec?.type !== "number") throw new Error(`no number param ${measureId}.${name}`);
  return spec;
}

const erAlpha = numberParam("EstebanRay", "alpha");
const erK = numberParam("EstebanRay", "K");
const mecAlpha = numberParam("MEC", "alpha");

describe("parseParamInput (ranges from the server's catalog)", () => {
  it("accepts in-range numbers, with a decimal comma too", () => {
    expect(parseParamInput(erAlpha, "1.2")).toEqual({ ok: true, value: 1.2 });
    expect(parseParamInput(erAlpha, " 0,5 ")).toEqual({ ok: true, value: 0.5 });
    expect(parseParamInput(erAlpha, "1.6")).toEqual({ ok: true, value: 1.6 });
    expect(parseParamInput(mecAlpha, "12")).toEqual({ ok: true, value: 12 });
  });

  it("rejects text, empty required fields and out-of-range values", () => {
    expect(parseParamInput(erAlpha, "abc")).toEqual({ ok: false, reason: "number" });
    expect(parseParamInput(erAlpha, "")).toEqual({ ok: false, reason: "number" });
    expect(parseParamInput(erAlpha, "1.7")).toEqual({ ok: false, reason: "range" });
    expect(parseParamInput(erAlpha, "0")).toEqual({ ok: false, reason: "range" });
    expect(parseParamInput(erK, "-1")).toEqual({ ok: false, reason: "range" });
  });

  it("treats an empty nullable K as automatic", () => {
    expect(parseParamInput(erK, "  ")).toEqual({ ok: true, value: null });
    expect(parseParamInput(erK, "2")).toEqual({ ok: true, value: 2 });
  });

  it("checks bounds only where the catalog has them", () => {
    const free: PolarizationNumberParam = { ...mecAlpha, minExclusive: null, max: null };
    expect(isInRange(free, -5)).toBe(true);
    expect(isInRange(free, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isInRange({ ...free, max: 2 }, 2)).toBe(true);
    expect(isInRange({ ...free, max: 2 }, 2.01)).toBe(false);
  });
});

describe("formatting", () => {
  it("formats parameter values, ranges, symbols and f(d) labels from the catalog", () => {
    expect(formatParamValue(null)).toBe("");
    expect(formatParamValue(undefined)).toBe("");
    expect(formatParamValue(0.8)).toBe("0.8");
    expect(formatParamValue("d^2")).toBe("d^2");
    expect(rangeText(erAlpha)).toBe("(0, 1.6]");
    expect(rangeText(mecAlpha)).toBe("> 0");
    expect(rangeText(erK)).toBe("> 0");
    expect(rangeText({ ...mecAlpha, minExclusive: null, max: 3 })).toBe("≤ 3");
    expect(rangeText({ ...mecAlpha, minExclusive: null, max: null })).toBe("");
    expect([paramSymbol("alpha"), paramSymbol("beta"), paramSymbol("K")]).toEqual(["α", "β", "K"]);
    expect(catalog.alienations.map((a) => alienationLabel(catalog.alienations, a.id))).toEqual([
      "d",
      "d²",
      "d³",
      "d + d²",
      "d + 2d²",
      "eᵈ − 1",
      "e²ᵈ − 1",
    ]);
    expect(alienationLabel(catalog.alienations, "unknown")).toBe("unknown");
  });

  it("formats measure values with 4 decimals in the UI language", () => {
    expect(formatMeasureValue(0.123456, "en")).toBe("0.1235");
    expect(formatMeasureValue(0.5, "es")).toBe("0,5000");
    expect(formatMeasureValue(null, "en")).toBe("—");
    expect(formatMeasureValue(Number.NaN, "en")).toBe("—");
  });

  it("formats normalized (shape) values with 2 decimals in the UI language", () => {
    expect(formatShapeValue(0.666, "en")).toBe("0.67");
    expect(formatShapeValue(0.5, "es")).toBe("0,50");
    expect(formatShapeValue(null, "en")).toBe("—");
    expect(formatShapeValue(Number.POSITIVE_INFINITY, "en")).toBe("—");
  });
});

describe("polarizationErrorOf", () => {
  const httpError = (status: number, data?: unknown) => ({
    isAxiosError: true,
    response: { status, data },
  });

  it("maps the server's answers to what the view says (no client fallback)", () => {
    expect(
      polarizationErrorOf(httpError(404, { error: "not_found", message: "disabled" })),
    ).toEqual({
      kind: "disabled",
      status: 404,
      message: "disabled",
    });
    expect(
      polarizationErrorOf(httpError(503, { error: "unavailable", message: "worker" })).kind,
    ).toBe("unavailable");
    expect(
      polarizationErrorOf(httpError(422, { error: "invalid_measure", message: "k" })).kind,
    ).toBe("invalid");
    expect(polarizationErrorOf(httpError(400)).kind).toBe("invalid");
    expect(polarizationErrorOf(httpError(400)).message).toBeNull();
    expect(
      polarizationErrorOf(httpError(500, { error: "internal_error", message: "x" })).kind,
    ).toBe("error");
    expect(polarizationErrorOf(new Error("Network Error"))).toEqual({
      kind: "error",
      status: null,
      message: null,
    });
    expect(polarizationErrorOf({ response: { status: "x" } }).status).toBeNull();
    expect(polarizationErrorOf(null).kind).toBe("error");
  });

  it("picks the message the view shows for each kind", () => {
    const info = (kind: "disabled" | "unavailable" | "error") => ({
      kind,
      status: null,
      message: null,
    });
    expect(polarizationErrorKey(info("disabled"))).toBe("polarization.errorDisabled");
    expect(polarizationErrorKey(info("unavailable"))).toBe("polarization.errorUnavailable");
    expect(polarizationErrorKey(info("error"))).toBe("polarization.errorGeneric");
    expect(polarizationErrorKey(null)).toBe("polarization.errorGeneric");
  });
});
