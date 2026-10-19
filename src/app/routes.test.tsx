import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { AppRoutes } from "./routes";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// Shell pieces unrelated to the public routes under test.
vi.mock("@/widgets/settings-dropdown", () => ({ SettingsDropdown: () => null }));
vi.mock("@/app/layouts/dashboard", () => ({ DashboardLayout: () => null }));
vi.mock("@/features/auth", () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/pages/login/login-page", () => ({ LoginPage: () => null }));

// Real FAQ / Contact / About / 404 pages; the heavy pages (live run → WebGL) are stubbed.
vi.mock("@/pages", async () => {
  const [{ AboutPage }, { ContactPage }, { FaqPage }, { NotFoundPage }] = await Promise.all([
    import("@/pages/about/about-page"),
    import("@/pages/contact/contact-page"),
    import("@/pages/faq/faq-page"),
    import("@/pages/not-found/not-found-page"),
  ]);
  const Stub = () => null;
  return {
    AboutPage,
    ContactPage,
    FaqPage,
    NotFoundPage,
    BoardPage: Stub,
    HomePage: Stub,
    LiveRunPage: Stub,
    ProfilePage: Stub,
    ResultsPage: Stub,
    WikiPage: Stub,
  };
});

// ─── Tests ───────────────────────────────────────────────────────────────────

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
