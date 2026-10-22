import { describe, expect, it } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and joins words with dashes", () => {
    expect(slugify("Run view")).toBe("run-view");
  });

  it("drops accents and the Spanish ñ tilde instead of the letters", () => {
    expect(slugify("Configuración de la señal")).toBe("configuracion-de-la-senal");
  });

  it("collapses punctuation and symbols into a single dash", () => {
    expect(slugify("Public vs. private — overview")).toBe("public-vs-private-overview");
    expect(slugify("¿Qué es «Colorear por»?")).toBe("que-es-colorear-por");
  });

  it("keeps digits", () => {
    expect(slugify("Step 2 of 3")).toBe("step-2-of-3");
  });

  it("trims dashes at both ends", () => {
    expect(slugify("  (Tip)  ")).toBe("tip");
    expect(slugify("-already-dashed-")).toBe("already-dashed");
  });

  it("gives an empty id for empty or symbol-only texts", () => {
    expect(slugify("")).toBe("");
    expect(slugify("—")).toBe("");
    expect(slugify("-")).toBe("");
  });
});
