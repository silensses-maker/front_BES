import { fireEvent, render, screen } from "@testing-library/react";
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

describe.each([
  ["en", en],
  ["es", es],
] as const)("SimulationCanvas topology load states (%s, #128)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
  });

  const renderCanvas = (props: Partial<Parameters<typeof SimulationCanvas>[0]>) =>
    render(
      <MemoryRouter>
        <SimulationCanvas status="connecting" topology={null} {...props} />
      </MemoryRouter>,
    );

  it("shows the pages downloaded in a live status and a progress bar, even while connecting", () => {
    renderCanvas({
      loadStatus: {
        phase: "loading",
        progress: { stage: "download", pagesDone: 12, pagesTotal: 30 },
      },
    });

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(
      locale.simulation.canvas.loadingNetworkPages
        .replace("{{done}}", "12")
        .replace("{{total}}", "30"),
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-label", locale.simulation.canvas.loadProgressLabel);
    expect(bar).toHaveAttribute("aria-valuenow", "40");
  });

  it("shows an indeterminate loading status before the first page", () => {
    renderCanvas({ loadStatus: { phase: "loading", progress: null } });
    expect(screen.getByRole("status")).toHaveTextContent(locale.simulation.canvas.loadingNetwork);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the preparing step while the topology is assembled", () => {
    renderCanvas({ loadStatus: { phase: "loading", progress: { stage: "assemble" } } });
    expect(screen.getByRole("status")).toHaveTextContent(locale.simulation.canvas.preparingData);
  });

  it("shows the error state with a retry when the download failed", () => {
    const onRetryLoad = vi.fn();
    renderCanvas({
      status: "completed",
      loadStatus: { phase: "failed", error: new Error("503") },
      onRetryLoad,
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(locale.simulation.canvas.loadFailedTitle);
    expect(alert).toHaveTextContent(locale.simulation.canvas.loadFailedBody);
    fireEvent.click(screen.getByRole("button", { name: locale.simulation.retry }));
    expect(onRetryLoad).toHaveBeenCalledOnce();
  });

  it("offers the way back to the board when no retry is wired", () => {
    renderCanvas({ loadStatus: { phase: "failed", error: new Error("503") } });
    expect(screen.getByRole("link", { name: locale.simulation.backToBoard })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: locale.simulation.retry })).toBeNull();
  });

  it("keeps the stream error first: a failed stream is not a failed download", () => {
    renderCanvas({ status: "error", loadStatus: { phase: "failed", error: new Error("x") } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(locale.simulation.errorStream)).toBeInTheDocument();
  });
});
