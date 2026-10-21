import { i18n } from "@/shared/i18n";
import polarizationEn from "@/shared/i18n/locales/polarization.en";
import polarizationEs from "@/shared/i18n/locales/polarization.es";

let registered = false;

/**
 * Adds the `polarization` strings (en, es) to i18next, once (#129). Called at the top of the
 * Polarization view and of the wiki section, before their first `t()`: both are lazy chunks, so
 * the strings stay out of the initial chunk (en.ts / es.ts only keep the tab label).
 */
export function registerPolarizationStrings(): void {
  if (registered) return;
  registered = true;
  i18n.addResourceBundle("en", "translation", { polarization: polarizationEn }, true, true);
  i18n.addResourceBundle("es", "translation", { polarization: polarizationEs }, true, true);
}
