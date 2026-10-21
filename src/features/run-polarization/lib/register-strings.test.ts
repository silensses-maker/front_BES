import { describe, expect, it } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import polarizationEn from "@/shared/i18n/locales/polarization.en";
import polarizationEs from "@/shared/i18n/locales/polarization.es";
import { registerPolarizationStrings } from "./register-strings";

describe("registerPolarizationStrings", () => {
  it("keeps only the tab label in the initial locales and adds the namespace on demand, once", async () => {
    expect(en.polarization).toEqual({ tab: "Polarization" });
    expect(es.polarization).toEqual({ tab: "Polarización" });

    registerPolarizationStrings();
    registerPolarizationStrings();
    await i18n.changeLanguage("en");
    expect(i18n.t("polarization.wiki.title")).toBe(polarizationEn.wiki.title);
    expect(i18n.t("polarization.tab")).toBe("Polarization");
    await i18n.changeLanguage("es");
    expect(i18n.t("polarization.retry")).toBe(polarizationEs.retry);
    expect(i18n.t("polarization.tab")).toBe("Polarización");
    await i18n.changeLanguage("en");
  });

  it("has the same keys in both languages", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      typeof value === "object" && value !== null
        ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    const sorted = (list: string[]) => [...list].sort((a, b) => a.localeCompare(b));
    expect(sorted(keys(polarizationEs))).toEqual(sorted(keys(polarizationEn)));
  });
});
