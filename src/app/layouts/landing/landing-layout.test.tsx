import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { type ComponentType, lazy } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import { LandingLayout } from "./landing-layout";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));
vi.mock("@/widgets/settings-dropdown", () => ({ SettingsDropdown: () => null }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A lazy page whose import the test settles by hand. */
function deferredPage() {
  let settle!: { resolve: (m: { default: ComponentType }) => void; reject: (e: unknown) => void };
  const Page = lazy(
    () =>
      new Promise<{ default: ComponentType }>((resolve, reject) => {
        settle = { resolve, reject };
      }),
  );
  return {
    Page,
    resolve: (C: ComponentType) => settle.resolve({ default: C }),
    reject: (e: unknown) => settle.reject(e),
  };
}

function DocPage() {
  return (
    <article>
      <h1>Doc</h1>
      <h2 id="section-one">Section one</h2>
      <h3 id="detail">Detail</h3>
    </article>
  );
}

function renderShell(path: string, routes: Record<string, ComponentType>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<LandingLayout />}>
          {Object.entries(routes).map(([to, Page]) => (
            <Route key={to} path={to} element={<Page />} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LandingLayout — lazy pages (#130)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    // React reports the errors a boundary catches; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("keeps the shell while the page loads, then builds the TOC from the resolved page", async () => {
    const wiki = deferredPage();
    renderShell("/wiki", { "/wiki": wiki.Page });

    expect(screen.getByRole("status")).toHaveTextContent(en.routeBoundary.loading);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();

    await act(async () => wiki.resolve(DocPage));

    const toc = await screen.findByRole("navigation", { name: en.nav.onThisPage });
    expect(within(toc).getByRole("link", { name: "Section one" })).toHaveAttribute(
      "href",
      "#section-one",
    );
    expect(within(toc).getByRole("link", { name: "Detail" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("clears a failed page's error when navigating to another page", async () => {
    const wiki = deferredPage();
    const chunkError = Object.assign(new Error("Loading chunk 9 failed."), {
      name: "ChunkLoadError",
    });
    renderShell("/wiki", { "/wiki": wiki.Page, "/results": DocPage });

    await act(async () => wiki.reject(chunkError));
    expect(await screen.findByRole("alert")).toHaveTextContent(en.routeBoundary.chunkErrorTitle);

    fireEvent.click(screen.getAllByRole("link", { name: en.nav.previousResults })[0]!);

    expect(await screen.findByRole("heading", { level: 1, name: "Doc" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
