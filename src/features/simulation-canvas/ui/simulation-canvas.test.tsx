import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { SimulationCanvas } from "./simulation-canvas";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// WebGL renderer + DuckDB data prep are out of scope: the idle branch never mounts them.
vi.mock("@cosmograph/react", () => ({
  Cosmograph: () => null,
  prepareCosmographData: vi.fn(),
}));

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.each([
  ["en", en],
  ["es", es],
] as const)("SimulationCanvas idle state (%s)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
  });

  it("shows a loading message while the topology has not arrived", () => {
    const { container } = render(
      <MemoryRouter>
        <SimulationCanvas status="running" topology={null} />
      </MemoryRouter>,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(locale.simulation.canvas.loadingNetwork);
    expect(status.querySelector(".animate-spin")).not.toBeNull();
    expect(container.textContent).not.toMatch(/Cosmograph|issue #47/);
  });
});
