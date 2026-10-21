import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import polarizationEs from "@/shared/i18n/locales/polarization.es";
import { WikiPage } from "./wiki-page";

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

const typesetMath = vi.fn(() => Promise.resolve());
vi.mock("@/shared/lib/load-mathjax", () => ({
  typesetMath: () => typesetMath(),
  clearMath: () => Promise.resolve(),
}));

describe("WikiPage (#129 sections)", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    typesetMath.mockClear();
  });

  it("documents variance over time and, with polarization compiled in, the polarization measures", () => {
    const { container } = render(<WikiPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: en.wiki.variance.title }),
    ).toBeInTheDocument();
    expect(container.querySelector("section#variance")?.innerHTML).toContain("\\sigma_t^{2}");
    // vitest compiles __POLARIZATION__ in
    expect(container.querySelector("section#polarization")).not.toBeNull();
    const order = Array.from(container.querySelectorAll("section")).map((s) => s.id);
    expect(order).toEqual([
      "degroot",
      "som-models",
      "variables",
      "variance",
      "polarization",
      "conclusion",
    ]);
    expect(typesetMath).toHaveBeenCalled();
  });

  it("renders the new sections in Spanish", async () => {
    await i18n.changeLanguage("es");
    render(<WikiPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: es.wiki.variance.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: polarizationEs.wiki.title }),
    ).toBeInTheDocument();
  });
});
