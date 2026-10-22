import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { nodeText } from "./node-text";

describe("nodeText", () => {
  it("joins strings, numbers and nested elements' text", () => {
    const heading = [
      "Atajos ",
      createElement("strong", null, "de ", createElement("kbd", null, "teclado")),
      " ",
      2,
    ];
    expect(nodeText(heading)).toBe("Atajos de teclado 2");
  });

  it("renders booleans, null and elements without children as nothing", () => {
    expect(nodeText([true, null, undefined, false, createElement("br", { key: "br" })])).toBe("");
    expect(nodeText(BigInt(7))).toBe("7");
  });
});
