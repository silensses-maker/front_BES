import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { AppRoutes } from "./routes";

// ─── Mocks ────────────────────────────────────────────────────────────────────

/** Lazy page modules the router has imported, and how often each stub mounted. */
const pages = vi.hoisted(() => ({
  loaded: new Set<string>(),
  mounts: new Map<string, number>(),
}));

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// Shell pieces unrelated to the routes under test; the dashboard shell is reduced to its outlet.
vi.mock("@/widgets/settings-dropdown", () => ({ SettingsDropdown: () => null }));
vi.mock("@/app/layouts/dashboard", async () => {
  const { Outlet } = await import("react-router-dom");
  return { DashboardLayout: () => <Outlet /> };
});
vi.mock("@/features/auth", () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/pages/login/login-page", () => ({ LoginPage: () => null }));
vi.mock("@/pages/home/home-page", () => ({ HomePage: () => null }));

// Real FAQ / Contact / About / 404 pages (the first three load lazily, as in the app); the heavy
// lazy pages (live run → WebGL) are stubbed and record that the router imported them.
vi.mock("@/pages/board/board-page", () => {
  pages.loaded.add("board");
  return { BoardPage: () => <StubPage name="board" to="/board/experiments" /> };
});
vi.mock("@/pages/live-run", () => {
  pages.loaded.add("live-run");
  return { LiveRunPage: () => <StubPage name="live-run" to="/board/simulation/run-1/net-1" /> };
});
vi.mock("@/pages/profile/profile-page", () => {
  pages.loaded.add("profile");
  return { ProfilePage: () => null };
});
vi.mock("@/pages/results/results-page", () => {
  pages.loaded.add("results");
  return { ResultsPage: () => null };
});
vi.mock("@/pages/wiki/wiki-page", () => {
  pages.loaded.add("wiki");
  return { WikiPage: () => null };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Stand-in page: counts its mounts and links to the other URL of the same route. */
function StubPage({ name, to }: { name: string; to: string }) {
  useEffect(() => {
    pages.mounts.set(name, (pages.mounts.get(name) ?? 0) + 1);
  }, [name]);
  return (
    <>
      <h1>{`${name} page`}</h1>
      <Link to={to}>{`next ${name} url`}</Link>
    </>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AppRoutes — route-level code splitting (#130)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  // Must run before any test that opens a protected route: lazy imports are cached per module.
  it("does not import the protected pages while rendering the public routes", async () => {
    window.history.pushState({}, "", "/home");
    render(<AppRoutes />);
    fireEvent.click(
      within(screen.getByRole("contentinfo")).getByRole("link", { name: en.footer.faq }),
    );
    await screen.findByRole("heading", { level: 1, name: en.faq.pageTitle });

    for (const page of ["board", "live-run", "profile"]) {
      expect(pages.loaded.has(page)).toBe(false);
    }
  });

  it("a protected deep link resolves its page chunk inside the dashboard shell", async () => {
    window.history.pushState({}, "", "/board/simulation/run-1");
    render(<AppRoutes />);

    expect(await screen.findByRole("heading", { name: "live-run page" })).toBeInTheDocument();
    expect(pages.loaded.has("live-run")).toBe(true);
  });

  it.each([
    ["board", "/board/new-simulation", "/board/experiments"],
    ["live-run", "/board/simulation/run-1", "/board/simulation/run-1/net-1"],
  ] as const)("%s keeps its page instance across the URLs of its route", async (name, from, to) => {
    pages.mounts.delete(name);
    window.history.pushState({}, "", from);
    render(<AppRoutes />);
    await screen.findByRole("heading", { name: `${name} page` });

    fireEvent.click(screen.getByRole("link", { name: `next ${name} url` }));

    await waitFor(() => expect(window.location.pathname).toBe(to));
    expect(screen.getByRole("heading", { name: `${name} page` })).toBeInTheDocument();
    expect(pages.mounts.get(name)).toBe(1);
  });
});

describe("AppRoutes — footer 'More' links", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.history.pushState({}, "", "/home");
  });

  it.each([
    ["faq", en.faq.pageTitle],
    ["contact", en.contact.pageTitle],
    ["about", en.about.pageTitle],
  ] as const)("/%s resolves to its page instead of the 404", async (key, title) => {
    render(<AppRoutes />);

    const footer = screen.getByRole("contentinfo");
    const link = within(footer).getByRole("link", { name: en.footer[key] });
    expect(link).toHaveAttribute("href", `/${key}`);

    fireEvent.click(link);

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/${key}`);
    expect(screen.queryByRole("heading", { level: 1, name: en.notFound.title })).toBeNull();
  });
});

describe.each([
  ["en", en],
  ["es", es],
] as const)("AppRoutes — unknown URL (%s)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
    window.history.pushState({}, "", "/this/route/does-not-exist");
  });

  it("renders the translated not-found page inside the landing shell", () => {
    render(<AppRoutes />);

    expect(
      screen.getByRole("heading", { level: 1, name: locale.notFound.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(locale.notFound.body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: locale.notFound.backHome })).toHaveAttribute(
      "href",
      "/home",
    );
    // Landing header + footer are present
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.queryByText("404 - Not Found")).toBeNull();
  });
});

// Tests run as a normal build (vitest.config.ts defines __BENCHMARK__ = false): the benchmark
// suite route (#126) does not exist, even on localhost.
describe("AppRoutes — /bench in a normal build", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.history.pushState({}, "", "/bench");
  });

  it("is an unknown URL that renders the 404 page", () => {
    expect(window.location.hostname).toBe("localhost");
    render(<AppRoutes />);
    expect(screen.getByRole("heading", { level: 1, name: en.notFound.title })).toBeInTheDocument();
  });
});
