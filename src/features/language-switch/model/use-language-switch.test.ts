import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLanguageSwitch } from "./use-language-switch";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/shared/i18n", () => ({
  useTranslation: vi.fn(),
}));

import { useTranslation } from "@/shared/i18n";

// ─── Types ───────────────────────────────────────────────────────────────────

type MockI18n = {
  language: string;
  changeLanguage: ReturnType<typeof vi.fn>;
};

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMockI18n(language: string): MockI18n {
  return {
    language,
    changeLanguage: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useLanguageSwitch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("currentLang", () => {
    it('returns "es" when i18n.language starts with "es"', () => {
      vi.mocked(useTranslation).mockReturnValue({
        i18n: makeMockI18n("es"),
      } as unknown as ReturnType<typeof useTranslation>);

      const { result } = renderHook(() => useLanguageSwitch());

      expect(result.current.currentLang).toBe("es");
    });

    it('returns "es" when i18n.language is a regional variant like "es-CO"', () => {
      vi.mocked(useTranslation).mockReturnValue({
        i18n: makeMockI18n("es-CO"),
      } as unknown as ReturnType<typeof useTranslation>);

      const { result } = renderHook(() => useLanguageSwitch());

      expect(result.current.currentLang).toBe("es");
    });

    it('returns "en" when i18n.language is "en"', () => {
      vi.mocked(useTranslation).mockReturnValue({
        i18n: makeMockI18n("en"),
      } as unknown as ReturnType<typeof useTranslation>);

      const { result } = renderHook(() => useLanguageSwitch());

      expect(result.current.currentLang).toBe("en");
    });

    it('returns "en" for any language that does not start with "es"', () => {
      vi.mocked(useTranslation).mockReturnValue({
        i18n: makeMockI18n("fr"),
      } as unknown as ReturnType<typeof useTranslation>);

      const { result } = renderHook(() => useLanguageSwitch());

      expect(result.current.currentLang).toBe("en");
    });
  });

  describe("changeLanguage", () => {
    it('calls i18n.changeLanguage with "en"', () => {
      const mockI18n = makeMockI18n("es");
      vi.mocked(useTranslation).mockReturnValue({ i18n: mockI18n } as unknown as ReturnType<
        typeof useTranslation
      >);

      const { result } = renderHook(() => useLanguageSwitch());

      act(() => {
        result.current.changeLanguage("en");
      });

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith("en");
    });

    it('calls i18n.changeLanguage with "es"', () => {
      const mockI18n = makeMockI18n("en");
      vi.mocked(useTranslation).mockReturnValue({ i18n: mockI18n } as unknown as ReturnType<
        typeof useTranslation
      >);

      const { result } = renderHook(() => useLanguageSwitch());

      act(() => {
        result.current.changeLanguage("es");
      });

      expect(mockI18n.changeLanguage).toHaveBeenCalledWith("es");
    });

    it('updates currentLang to "en" on next render after changing language', () => {
      const mockI18n = makeMockI18n("es");
      vi.mocked(useTranslation).mockReturnValue({ i18n: mockI18n } as unknown as ReturnType<
        typeof useTranslation
      >);

      const { result, rerender } = renderHook(() => useLanguageSwitch());

      expect(result.current.currentLang).toBe("es");

      mockI18n.language = "en";
      vi.mocked(useTranslation).mockReturnValue({ i18n: mockI18n } as unknown as ReturnType<
        typeof useTranslation
      >);

      rerender();

      expect(result.current.currentLang).toBe("en");
    });
  });

  describe("supportedLangs", () => {
    it('exports ["en", "es"]', () => {
      vi.mocked(useTranslation).mockReturnValue({
        i18n: makeMockI18n("en"),
      } as unknown as ReturnType<typeof useTranslation>);

      const { result } = renderHook(() => useLanguageSwitch());

      expect(result.current.supportedLangs).toEqual(["en", "es"]);
    });
  });
});
