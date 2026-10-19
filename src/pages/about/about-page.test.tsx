import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { PARTNERS } from "@/shared/config/partners";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { AboutPage } from "./about-page";

// Real i18n instance + real locale files: the test checks the rendered copy per language.

const FULL_NAME =
  "Simulation Laboratory of the Evolution of Opinion in Social Networks under the influence of the Spiral of Silence";
const PROMUEVA_URL = "https://sites.google.com/view/promueva/";
const PROMUEVA_TEAM_URL = "https://sites.google.com/view/promueva/equipo";
const AVISPA_URL = "https://eisc.univalle.edu.co/index.php/grupos-investigacion/avispa";
const ARXIV_URL = "https://arxiv.org/abs/2410.19685";

const H2_KEYS = [
  "modelTitle",
  "originTitle",
  "promuevaTitle",
  "avispaTitle",
  "referencesTitle",
  "partnersTitle",
] as const;

const BODY_KEYS = [
  "pageIntro",
  "pageIntroUsage",
  "modelBody",
  "originBody",
  "promuevaIntro",
  "promuevaObjective",
  "avispaBody",
  "referencesIntro",
] as const;

/** Text of a <Trans> string once its <arxiv> tags are rendered as a link. */
const plain = (value: string) => value.replace(/<\/?arxiv>/g, "");

function renderPage() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  );
}

/** List that directly follows the level-3 heading named `name`. */
function listAfterHeading(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name });
  const list = heading.nextElementSibling;
  if (!(list instanceof HTMLElement) || !["OL", "UL"].includes(list.tagName)) {
    throw new Error(`no list after heading "${name}"`);
  }
  return list;
}

const items = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((li) => li.textContent);

describe.each([
  ["en", en],
  ["es", es],
] as const)("AboutPage (%s)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
  });

  /** Accessible name of an external link, without the screen-reader suffix. */
  const visibleName = (name: string) => name.replace(locale.common.opensInNewTab, "").trim();

  function externalLink(label: string): HTMLElement {
    const link = screen.getByRole("link", { name: (name) => visibleName(name) === label });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(link).getByText(locale.common.opensInNewTab)).toHaveClass("sr-only");
    return link;
  }

  it("renders the translated title, intro and every section", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: locale.about.pageTitle }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(H2_KEYS.length);
    for (const key of H2_KEYS) {
      expect(
        screen.getByRole("heading", { level: 2, name: locale.about[key] }),
      ).toBeInTheDocument();
    }
    for (const key of BODY_KEYS) {
      expect(screen.getByText(locale.about[key])).toBeInTheDocument();
    }
  });

  it("states the official full name and the thesis title", () => {
    renderPage();

    expect(locale.about.pageIntro).toContain(FULL_NAME);
    expect(locale.about.originBody).toContain(
      "Towards a Model of Opinion Evolution Considering the Spiral of Silence",
    );
  });

  it("links the model section to the wiki", () => {
    renderPage();

    expect(screen.getByRole("link", { name: locale.about.modelLink })).toHaveAttribute(
      "href",
      "/wiki",
    );
  });

  it("lists the PROMUEVA lines of work and institutions and links its site and team", () => {
    renderPage();

    expect(items(listAfterHeading(locale.about.promuevaLinesTitle))).toEqual([
      locale.about.promuevaLine1,
      locale.about.promuevaLine2,
      locale.about.promuevaLine3,
    ]);
    expect(items(listAfterHeading(locale.about.promuevaInstitutionsTitle))).toEqual([
      "Universidad del Valle",
      "Pontificia Universidad Javeriana Cali",
      "Université Sorbonne Paris Nord (Laboratoire d'Informatique de Paris Nord, LIPN)",
      "LIX – École Polytechnique",
      "CNRS",
    ]);
    expect(externalLink(locale.about.promuevaSiteLink)).toHaveAttribute("href", PROMUEVA_URL);
    expect(externalLink(locale.about.promuevaTeamLink)).toHaveAttribute("href", PROMUEVA_TEAM_URL);
  });

  it("lists the AVISPA research lines and links its page", () => {
    renderPage();

    expect(items(listAfterHeading(locale.about.avispaLinesTitle))).toEqual([
      locale.about.avispaLine1,
      locale.about.avispaLine2,
      locale.about.avispaLine3,
      locale.about.avispaLine4,
      locale.about.avispaLine5,
      locale.about.avispaLine6,
      locale.about.avispaLine7,
    ]);
    expect(externalLink(locale.about.avispaLink)).toHaveAttribute("href", AVISPA_URL);
  });

  it("lists the three references and links the arXiv preprint", () => {
    renderPage();

    const section = screen
      .getByRole("heading", { level: 2, name: locale.about.referencesTitle })
      .closest("section");
    if (!section) throw new Error("references section missing");
    const references = within(section)
      .getAllByRole("listitem")
      .map((li) => li.textContent?.replace(locale.common.opensInNewTab, ""));

    expect(references).toEqual([
      locale.about.reference1,
      plain(locale.about.reference2),
      locale.about.reference3,
    ]);
    expect(externalLink("arXiv:2410.19685")).toHaveAttribute("href", ARXIV_URL);
  });

  it("lists every partner from the shared config as an external link", () => {
    renderPage();

    for (const partner of PARTNERS) {
      expect(externalLink(partner.alt)).toHaveAttribute("href", partner.href);
    }
  });

  it("does not link to any code repository", () => {
    const { container } = renderPage();

    expect(container.querySelector('a[href*="github.com"]')).toBeNull();
    expect(container.textContent).not.toMatch(/github/i);
  });
});
