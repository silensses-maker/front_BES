import { useTranslation } from "@/shared/i18n";
import { type Lang, useLanguageSwitch } from "../model/use-language-switch";

export function LanguageSwitcher() {
  const { currentLang, changeLanguage, supportedLangs } = useLanguageSwitch();
  const { t } = useTranslation();

  const LANG_LABELS: Record<Lang, string> = {
    en: t("nav.en"),
    es: t("nav.es"),
  };

  return (
    <select
      value={currentLang}
      onChange={(e) => changeLanguage(e.target.value as Lang)}
      className="cursor-pointer rounded-md border border-input bg-transparent px-2 py-1 text-sm"
      aria-label={t("nav.language")}
    >
      {supportedLangs.map((lang) => (
        <option key={lang} value={lang}>
          {LANG_LABELS[lang]}
        </option>
      ))}
    </select>
  );
}
