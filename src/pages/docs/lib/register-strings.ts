import { i18n } from "@/shared/i18n";
import docsEn from "@/shared/i18n/locales/docs.en";
import docsEs from "@/shared/i18n/locales/docs.es";

let registered = false;

/**
 * Adds the manual's `docs` strings (en, es) to i18next, once. Called at the top of the manual's
 * page, before its first `t()`: the page is a lazy chunk, so the strings stay out of the initial
 * chunk (like the polarization strings, run-polarization/lib/register-strings.ts).
 */
export function registerDocsStrings(): void {
  if (registered) return;
  registered = true;
  i18n.addResourceBundle("en", "translation", { docs: docsEn }, true, true);
  i18n.addResourceBundle("es", "translation", { docs: docsEs }, true, true);
}
