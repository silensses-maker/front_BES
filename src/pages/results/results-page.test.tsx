import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { ResultsPage } from "./results-page";

function renderPage() {
  return render(
    <MemoryRouter>
      <ResultsPage />
    </MemoryRouter>,
  );
}

describe("ResultsPage (coming soon)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each([
    ["en", en],
    ["es", es],
  ] as const)("shows the honest coming-soon copy in %s", async (lang, locale) => {
    await i18n.changeLanguage(lang);
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: locale.results.pageTitle })).toBeTruthy();
    expect(screen.getByText(locale.results.pageIntro)).toBeTruthy();
    expect(screen.getByText(locale.results.comingSoonBadge)).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: locale.results.comingSoonTitle }),
    ).toBeTruthy();
    expect(screen.getByText(locale.results.comingSoonBody)).toBeTruthy();
  });

  it("links to the Wiki and to the simulation board", () => {
    renderPage();
    expect(screen.getByRole("link", { name: en.results.ctaWiki })).toHaveAttribute("href", "/wiki");
    expect(screen.getByRole("link", { name: en.results.ctaBoard })).toHaveAttribute(
      "href",
      "/board",
    );
  });

  it("shows no placeholder or invented result", () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/lorem ipsum|iteration 312|featured study/i);
  });
});
