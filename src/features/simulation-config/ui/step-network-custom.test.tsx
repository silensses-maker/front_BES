import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CUSTOM_FORM } from "../model/simulation-config.store";
import { StepNetworkCustom } from "./step-network-custom";

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

describe("StepNetworkCustom — save mode (#133)", () => {
  it("has no save-mode selector; the header fields are still there", () => {
    render(
      <StepNetworkCustom
        values={{ ...DEFAULT_CUSTOM_FORM, networkName: "Net", saveMode: 2 }}
        maxIterations={null}
        errors={{}}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/saveMode/)).not.toBeInTheDocument();
    expect(screen.getByText("simulationConfig.customNetworkName")).toBeInTheDocument();
    expect(screen.getByText("simulationConfig.iterationLimit")).toBeInTheDocument();
  });
});
