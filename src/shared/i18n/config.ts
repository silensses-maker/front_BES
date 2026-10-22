import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import es from "./locales/es";

// <html lang> follows the UI language (screen readers, hyphenation, the browser's translation
// offer); index.html ships "en". Registered before init so the detected language applies too.
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = i18n.resolvedLanguage ?? lng;
});

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "es"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
