import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { FaqPage } from "./faq-page";

// ROLE_LIMITS comes from the user entity, whose store imports the Firebase client.
vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// Real i18n instance + real locale files: the test checks the rendered copy per language.

const CONTACT_EMAIL = "silensses@correounivalle.edu.co";
const FULL_NAME =
  "Simulation Laboratory of the Evolution of Opinion in Social Networks under the influence of the Spiral of Silence";

const QUESTION_KEYS = [
  "whatIsQuestion",
  "whoCanUseQuestion",
  "quotasQuestion",
  "retentionQuestion",
  "exportQuestion",
  "llmQuestion",
  "browserQuestion",
  "modelQuestion",
  "contactQuestion",
] as const;

const ANSWER_KEYS = [
  "whatIsAnswer",
  "whoCanUseAnswer",
  "quotasAnswer",
  "retentionAnswer",
  "exportAnswer",
  "llmAnswer",
  "browserAnswer",
  "modelAnswer",
] as const;

function renderPage() {
  return render(
    <MemoryRouter>
      <FaqPage />
    </MemoryRouter>,
  );
}

/** Text of the contact answer once <Trans> renders its <mail> tags and the address. */
const contactAnswerText = (value: string) =>
  value.replace(/<\/?mail>/g, "").replace("{{email}}", CONTACT_EMAIL);

/** Cells of the quotas row for `role`, digits only (locale-independent grouping). */
function quotaRow(role: string): string[] {
  const row = screen.getByRole("row", { name: (name) => name.startsWith(role) });
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent ?? "");
}

const digits = (value: string) => value.replace(/\D/g, "");

describe.each([
  ["en", en],
  ["es", es],
] as const)("FaqPage (%s)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
  });

  it("renders the translated title and every question with its answer", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: locale.faq.pageTitle }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(QUESTION_KEYS.length);
    for (const key of QUESTION_KEYS) {
      expect(screen.getByRole("heading", { level: 2, name: locale.faq[key] })).toBeInTheDocument();
    }
    for (const key of ANSWER_KEYS) {
      expect(screen.getByText(locale.faq[key])).toBeInTheDocument();
    }
  });

  it("shows the role quotas from the permissions table", () => {
    renderPage();

    expect(
      screen.getByRole("columnheader", { name: locale.faq.quotasColAgents }),
    ).toBeInTheDocument();

    const [guestRole, ...guest] = quotaRow("Guest");
    expect(guestRole).toBe("Guest");
    expect(guest.map(digits)).toEqual(["10", "10", "1"]);

    const [, ...baseUser] = quotaRow("BaseUser");
    expect(baseUser.map(digits)).toEqual(["100", "100", "5"]);

    const [, ...researcher] = quotaRow("Researcher");
    expect(researcher.map(digits)).toEqual(["1000", "1000", "20"]);

    const [, ...administrator] = quotaRow("Administrator");
    expect(administrator).toEqual([
      locale.common.unlimited,
      locale.common.unlimited,
      locale.common.unlimited,
    ]);
  });

  it("names SiLEnSeSS in full and places it in the PROMUEVA project", () => {
    renderPage();

    expect(locale.faq.whatIsAnswer).toContain(FULL_NAME);
    expect(locale.faq.whatIsAnswer).toContain("PROMUEVA");
    expect(locale.faq.whatIsAnswer).toContain(
      "Modelos computacionales de redes sociales aplicados a la polarización del Valle del Cauca",
    );
  });

  it("answers how to ask a question or report a problem with a mailto link", () => {
    renderPage();

    const section = screen
      .getByRole("heading", { level: 2, name: locale.faq.contactQuestion })
      .closest("section");
    if (!section) throw new Error("contact question section missing");

    const link = within(section).getByRole("link", { name: CONTACT_EMAIL });
    expect(link).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    expect(link).not.toHaveAttribute("target");
    expect(section.querySelector("p")?.textContent).toBe(
      contactAnswerText(locale.faq.contactAnswer),
    );
  });

  it("does not link to or mention any code repository", () => {
    const { container } = renderPage();

    expect(container.querySelector('a[href*="github.com"]')).toBeNull();
    expect(container.textContent).not.toMatch(/github/i);
  });

  it("links the model question to the wiki", () => {
    renderPage();

    expect(screen.getByRole("link", { name: locale.faq.modelLink })).toHaveAttribute(
      "href",
      "/wiki",
    );
  });
});
