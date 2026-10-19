import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CONSENSUS_PURSUIT_TEMPLATE } from "../lib/templates";
import { StepNetwork } from "./step-network";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Keep i18n deterministic without loading the real locale files.
vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

// Radix Tooltip needs a provider; the hint bodies are not under test, so they render nothing
// (otherwise they would land as text inside each field label).
vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StepNetwork — save mode (#133)", () => {
  it("has no save-mode selector; the network fields are still there", () => {
    render(
      <StepNetwork
        values={{ ...CONSENSUS_PURSUIT_TEMPLATE, saveMode: 0 }}
        maxAgents={null}
        maxIterations={null}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/saveMode/)).not.toBeInTheDocument();
    expect(screen.getByText("simulationConfig.numberOfNetworks")).toBeInTheDocument();
    expect(screen.getByText("simulationConfig.iterationLimit")).toBeInTheDocument();
  });
});
