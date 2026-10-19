import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PARTNERS } from "@/shared/config/partners";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { ContactPage } from "./contact-page";

// Real i18n instance + real locale files: the test checks the rendered copy per language.

const CONTACT_EMAIL = "silensses@correounivalle.edu.co";

function partnerHref(id: (typeof PARTNERS)[number]["id"]): string {
  const partner = PARTNERS.find((p) => p.id === id);
  if (!partner) throw new Error(`partner ${id} missing from config`);
  return partner.href;
}

describe.each([
  ["en", en],
  ["es", es],
] as const)("ContactPage (%s)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
  });

  it("renders the translated title, intro and both channels", () => {
    render(<ContactPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: locale.contact.pageTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(locale.contact.pageIntro)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: locale.contact.emailTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: locale.contact.researchTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(locale.contact.emailBody)).toBeInTheDocument();
    expect(screen.getByText(locale.contact.researchBody)).toBeInTheDocument();
  });

  it("offers the contact address as a mailto link", () => {
    render(<ContactPage />);

    const link = screen.getByRole("link", { name: CONTACT_EMAIL });
    expect(link).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    // A mailto link hands off to the mail client: no new tab.
    expect(link).not.toHaveAttribute("target");
  });

  it("points to the PROMUEVA, AVISPA and Univalle websites", () => {
    render(<ContactPage />);

    const cases = [
      [locale.contact.promuevaLink, partnerHref("promueva")],
      [locale.contact.avispaLink, partnerHref("avispa")],
      [locale.contact.univalleLink, partnerHref("univalle")],
    ] as const;

    for (const [label, href] of cases) {
      const link = screen.getByRole("link", { name: (name) => name.startsWith(label) });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    // The three websites plus the mailto link — nothing else.
    expect(screen.getAllByRole("link")).toHaveLength(cases.length + 1);
  });

  it("does not link to or mention any code repository", () => {
    const { container } = render(<ContactPage />);

    expect(container.querySelector('a[href*="github.com"]')).toBeNull();
    expect(container.textContent).not.toMatch(/github/i);
  });
});
