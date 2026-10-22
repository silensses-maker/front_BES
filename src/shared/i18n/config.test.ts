import { afterEach, describe, expect, it } from "vitest";
import i18n from "./config";

describe("i18n config: <html lang>", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("follows the UI language", async () => {
    await i18n.changeLanguage("es");
    expect(document.documentElement.lang).toBe("es");
    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("uses the resolved language for a regional variant", async () => {
    await i18n.changeLanguage("es-CO");
    expect(document.documentElement.lang).toBe("es");
  });
});
