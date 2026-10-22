import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import docsEn from "@/shared/i18n/locales/docs.en";
import docsEs from "@/shared/i18n/locales/docs.es";
import { slugify } from "@/shared/lib/slugify";
import { DocsPage } from "./docs-page";
import { DOC_SECTIONS, type DocLang } from "./model/sections";

// The manual's embeds read ROLE_LIMITS: the user entity's store imports the Firebase client
vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// Real i18n instance, real locale files and the real MDX sections (compiled by vitest.config.ts)

const NOT_FOUND = "page not found";

function renderDocs(path: string) {
  const page = <DocsPage notFound={<p>{NOT_FOUND}</p>} />;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/docs" element={page} />
        <Route path="/docs/:section" element={page} />
      </Routes>
    </MemoryRouter>,
  );
}

const DOCS: Record<DocLang, Record<keyof typeof docsEn, string>> = { en: docsEn, es: docsEs };

/** The section's text, once its MDX chunk has loaded: its first heading. */
const sectionLoaded = async () => (await screen.findAllByRole("heading", { level: 2 }))[0];

describe.each(["en", "es"] as const)("DocsPage (%s)", (lang) => {
  const docs = DOCS[lang];

  beforeEach(async () => {
    await i18n.changeLanguage(lang);
  });

  it("opens on the index: the title, the intro links and one card per section", () => {
    renderDocs("/docs");

    expect(screen.getByRole("heading", { level: 1, name: docs.pageTitle })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Wiki" })[0]).toHaveAttribute("href", "/wiki");
    const article = screen.getByRole("heading", { level: 1 }).closest("article");
    const cards = within(article as HTMLElement).getByRole("list");
    expect(within(cards).getAllByRole("link")).toHaveLength(DOC_SECTIONS.length);
    for (const section of DOC_SECTIONS) {
      const card = within(cards).getByRole("link", {
        name: new RegExp(section.title[lang]),
      });
      expect(card).toHaveAttribute("href", `/docs/${section.id}`);
      expect(card).toHaveTextContent(section.summary[lang]);
    }
    // The index's pager only leads forward, to the first section
    expect(screen.queryByRole("link", { name: new RegExp(docs.previous) })).toBeNull();
    expect(screen.getByRole("link", { name: new RegExp(docs.next) })).toHaveAttribute(
      "href",
      `/docs/${DOC_SECTIONS[0]?.id}`,
    );
  });

  it("lists every section in the sidebar and marks the one being read", async () => {
    renderDocs("/docs/my-experiments");
    await sectionLoaded();

    const nav = screen.getByRole("navigation", { name: docs.sectionsLabel });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(DOC_SECTIONS.length + 1);
    expect(links[0]).toHaveTextContent(docs.overview);
    expect(within(nav).getByRole("link", { current: "page" })).toHaveAttribute(
      "href",
      "/docs/my-experiments",
    );
  });

  it.each(
    DOC_SECTIONS.map((section) => [section.id, section] as const),
  )("renders the %s section with its MDX text", async (_id, section) => {
    renderDocs(`/docs/${section.id}`);

    expect(
      screen.getByRole("heading", { level: 1, name: section.title[lang] }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(docs.sectionNumber.replace("{{n}}", String(section.order))),
    ).toBeInTheDocument();
    expect(screen.getByText(section.summary[lang])).toBeInTheDocument();

    await sectionLoaded();
    expect(screen.queryByText(docs.loadingSection)).toBeNull();
    // Every heading carries its slug as id, for the "On this page" list and the manual's links
    for (const heading of screen.getAllByRole("heading", { level: 2 })) {
      expect(heading.id).toBe(slugify(heading.textContent ?? ""));
      expect(heading.id).not.toBe("");
    }
    // Internal links navigate inside the app
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("target")).toBeNull();
    }
  });

  it("links the first section back to the index and the last one to nothing", async () => {
    const first = DOC_SECTIONS[0];
    const last = DOC_SECTIONS[DOC_SECTIONS.length - 1];
    const { unmount } = renderDocs(`/docs/${first?.id}`);
    await sectionLoaded();
    expect(screen.getByRole("link", { name: new RegExp(docs.previous) })).toHaveAttribute(
      "href",
      "/docs",
    );
    expect(screen.getByRole("link", { name: new RegExp(docs.next) })).toHaveAttribute(
      "href",
      `/docs/${DOC_SECTIONS[1]?.id}`,
    );
    unmount();

    renderDocs(`/docs/${last?.id}`);
    await sectionLoaded();
    expect(screen.queryByRole("link", { name: new RegExp(docs.next) })).toBeNull();
  });

  it("shows the callouts with their translated titles", async () => {
    renderDocs("/docs/getting-started");
    await sectionLoaded();

    expect(screen.getByText(docs.tip)).toBeInTheDocument();
    expect(screen.getByText(docs.warning)).toBeInTheDocument();
  });

  it("describes the Polarization tab in a build that has it", async () => {
    // polarization (#129): compiled in under test; a flag-off build renders nothing there
    const polarization = DOC_SECTIONS.find((section) => section.id === "polarization");
    renderDocs("/docs/charts-and-data");
    await sectionLoaded();

    const heading = screen.getByRole("heading", { level: 3, name: polarization?.title[lang] });
    expect(heading).toHaveAttribute("id", slugify(polarization?.title[lang] ?? ""));
    expect(screen.getByRole("link", { name: polarization?.title[lang] })).toHaveAttribute(
      "href",
      "/docs/polarization",
    );
  });

  it("serves the screenshots of the language read, and a pending frame until they exist", async () => {
    renderDocs("/docs/getting-started");
    await sectionLoaded();

    const figure = document.querySelector('[data-screenshot="login"]');
    const img = figure?.querySelector("img");
    expect(img).toHaveAttribute("src", `/docs/${lang}/light/login.webp`);

    fireEvent.error(img as HTMLImageElement);

    expect(within(figure as HTMLElement).getByText(docs.screenshotPending)).toBeInTheDocument();
    expect(
      within(figure as HTMLElement).getByText(
        docs.screenshotFile.replace("{{file}}", `/docs/${lang}/light/login.webp`),
      ),
    ).toBeInTheDocument();
    expect(figure?.querySelector("img")).toBeNull();
  });

  it("renders the app's 404 page for an unknown section", () => {
    renderDocs("/docs/not-a-section");

    expect(screen.getByText(NOT_FOUND)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: docs.sectionsLabel })).toBeNull();
  });
});

describe("DocsPage language switch", () => {
  it("reloads the section being read in the new language", async () => {
    await i18n.changeLanguage("es");
    const section = DOC_SECTIONS.find((entry) => entry.id === "run-view");
    renderDocs("/docs/run-view");
    expect(await sectionLoaded()).toHaveTextContent("La vista de corrida");

    await act(async () => {
      await i18n.changeLanguage("en");
    });

    expect(screen.getByRole("heading", { level: 1, name: section?.title.en })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "The run view" })).toHaveAttribute(
      "id",
      "the-run-view",
    );
    expect(screen.queryByRole("heading", { level: 2, name: "La vista de corrida" })).toBeNull();
  });
});
