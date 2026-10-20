import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RunSummary } from "@/shared/api/backend/types/backend.types";
import { RunDetailCard } from "./run-detail-card";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));

// Radix Tooltip requires pointer-events which happy-dom doesn't fully provide.
vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const generatedRun: RunSummary = {
  id: "7123456789012345678",
  type: "generated",
  name: null,
  status: "completed",
  networkCount: 3,
  iterationLimit: 1000,
  stopThreshold: 0.001,
  createdAt: "2026-10-19T12:34:56Z",
  seed: "9223372036854775807",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("RunDetailCard — seed, export and re-launch (#127)", () => {
  it("shows the exact seed of a generated run", () => {
    render(<RunDetailCard run={generatedRun} />);

    expect(screen.getByText("simulationHistory.runSeed")).toBeInTheDocument();
    expect(screen.getByText("9223372036854775807")).toBeInTheDocument();
  });

  it("has no seed row for custom runs or when the backend reports none", () => {
    const { rerender } = render(
      <RunDetailCard run={{ ...generatedRun, type: "custom", name: "Red", seed: null }} />,
    );
    expect(screen.queryByText("simulationHistory.runSeed")).not.toBeInTheDocument();

    const { seed: _seed, ...withoutSeed } = generatedRun;
    rerender(<RunDetailCard run={withoutSeed} />);
    expect(screen.queryByText("simulationHistory.runSeed")).not.toBeInTheDocument();
  });

  it("offers the export only when a handler is provided, and calls it", () => {
    const onExportConfig = vi.fn();
    const { rerender } = render(<RunDetailCard run={generatedRun} />);
    expect(
      screen.queryByRole("button", { name: "simulationHistory.exportConfig" }),
    ).not.toBeInTheDocument();

    rerender(<RunDetailCard run={generatedRun} onExportConfig={onExportConfig} />);
    fireEvent.click(screen.getByRole("button", { name: "simulationHistory.exportConfig" }));

    expect(onExportConfig).toHaveBeenCalledOnce();
    expect(screen.getByText("simulationHistory.exportConfigTip")).toBeInTheDocument();
  });

  it("offers Re-launch for generated runs and reports the click", () => {
    const onRelaunch = vi.fn();
    render(<RunDetailCard run={generatedRun} onRelaunch={onRelaunch} />);

    fireEvent.click(screen.getByRole("button", { name: "simulationHistory.relaunch" }));

    expect(onRelaunch).toHaveBeenCalledOnce();
    expect(screen.getByText("simulationHistory.relaunchTip")).toBeInTheDocument();
    expect(screen.queryByText("simulationHistory.relaunchCustomHint")).not.toBeInTheDocument();
  });

  it("disables Re-launch while the configuration loads", () => {
    render(<RunDetailCard run={generatedRun} onRelaunch={vi.fn()} relaunching />);

    expect(screen.getByRole("button", { name: "common.loading" })).toBeDisabled();
  });

  it("points custom runs to their exported file instead of a Re-launch button", () => {
    render(
      <RunDetailCard run={{ ...generatedRun, type: "custom", seed: null }} onRelaunch={vi.fn()} />,
    );

    expect(
      screen.queryByRole("button", { name: "simulationHistory.relaunch" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("simulationHistory.relaunchCustomHint")).toBeInTheDocument();
  });

  it("still opens the run", () => {
    render(<RunDetailCard run={generatedRun} />);

    fireEvent.click(screen.getByRole("button", { name: "simulationHistory.openLiveRun" }));

    expect(mockNavigate).toHaveBeenCalledWith(`/board/simulation/${generatedRun.id}`);
  });
});
