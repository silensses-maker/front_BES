import { useTranslation } from "@/shared/i18n";

const SUPPORTED_LANGS = ["en", "es"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export function useLanguageSwitch() {
  const { i18n } = useTranslation();

  const currentLang: Lang = i18n.language.startsWith("es") ? "es" : "en";

  const changeLanguage = (lang: Lang) => {
    i18n.changeLanguage(lang);
  };

  return { currentLang, changeLanguage, supportedLangs: SUPPORTED_LANGS };
}
