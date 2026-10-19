import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { HomePage } from "./home-page";

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// Real i18n instance + real locale files: the test checks the rendered copy per language.

/** Keys of the Introduction / Examples sections (formerly hard-coded English). */
const MOVED_KEYS = [
  "introTitle",
  "introP1",
  "introP2",
  "examplesTitle",
  "examplesIntro",
  "exampleConsensusTitle",
  "exampleConsensusBody",
  "exampleSilenceTitle",
  "exampleSilenceBody",
] as const;

/** Text of a <Trans> string once its <bold> tags are rendered as elements. */
const plain = (value: string) => value.replace(/<\/?bold>/g, "");

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe.each([
  ["en", en],
  ["es", es],
] as const)("HomePage (%s)", (lng, locale) => {
  beforeEach(async () => {
    useAuthStore.setState({ user: null });
    await i18n.changeLanguage(lng);
  });

  it("renders the Introduction and Examples sections from the locale", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";

    expect(
      screen.getByRole("heading", { level: 2, name: locale.home.introTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: locale.home.examplesTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: locale.home.exampleConsensusTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: locale.home.exampleSilenceTitle }),
    ).toBeInTheDocument();
    for (const key of MOVED_KEYS) {
      expect(text).toContain(plain(locale.home[key]));
    }
  });

  it("keeps the model names in bold inside the translated paragraph", () => {
    const { container } = renderPage();
    const bold = Array.from(container.querySelectorAll("strong")).map((el) => el.textContent);

    // Same term the wiki uses for the theory in each language
    expect(bold).toEqual(["DeGroot", locale.wiki.spiralOfSilence]);
  });

  it("contains none of the removed unsupported claims", () => {
    const { container } = renderPage();
    const text = container.textContent ?? "";

    for (const claim of [
      /Erdős/,
      /Rényi/,
      /2022/,
      /calibrat/i,
      /calibrad/i,
      /election/i,
      /elecci/i,
    ]) {
      expect(text).not.toMatch(claim);
    }
  });
});

describe("HomePage — no hard-coded English", () => {
  it("renders no English copy of the moved sections when the language is Spanish", async () => {
    await i18n.changeLanguage("es");
    const { container } = renderPage();
    const text = container.textContent ?? "";

    for (const key of MOVED_KEYS) {
      expect(text).not.toContain(plain(en.home[key]));
    }
    // The literals the page used to hard-code
    for (const literal of [
      "Introduction",
      "Examples",
      "Consensus under DeGroot",
      "Silencing cascade",
    ]) {
      expect(text).not.toContain(literal);
    }
  });
});
