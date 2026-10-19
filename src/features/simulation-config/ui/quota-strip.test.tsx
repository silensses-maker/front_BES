import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuotaStrip } from "./quota-strip";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Deterministic i18n: the key followed by its interpolation params.
vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params
        ? `${key} ${Object.entries(params)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(" ")}`
        : key,
    i18n: { language: "en" },
  }),
}));

// Radix Tooltip requires pointer-events which happy-dom doesn't fully provide.
vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function hint(): string {
  return screen.getByText(/^simulationConfig\.userLimitsHint/).textContent ?? "";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("QuotaStrip — role quota hint", () => {
  it("lists the network cap next to agents and iterations (#122)", () => {
    render(
      <QuotaStrip
        role="Researcher"
        maxAgents={1000}
        maxIterations={1000}
        maxNetworks={20}
        onDiscard={vi.fn()}
      />,
    );

    expect(hint()).toBe(
      "simulationConfig.userLimitsHint role=Researcher maxAgents=1,000 maxIterations=1,000 maxNetworks=20",
    );
  });

  it("shows ∞ for an unlimited network cap, whether null or Infinity", () => {
    const { rerender } = render(
      <QuotaStrip
        role="Administrator"
        maxAgents={null}
        maxIterations={null}
        maxNetworks={null}
        onDiscard={vi.fn()}
      />,
    );
    expect(hint()).toContain("maxNetworks=∞");

    rerender(
      <QuotaStrip
        role="Administrator"
        maxAgents={Infinity}
        maxIterations={Infinity}
        maxNetworks={Infinity}
        onDiscard={vi.fn()}
      />,
    );
    expect(hint()).toContain("maxNetworks=∞");
  });

  it("shows the Guest cap of a single network", () => {
    render(
      <QuotaStrip
        role="Guest"
        maxAgents={10}
        maxIterations={10}
        maxNetworks={1}
        onDiscard={vi.fn()}
      />,
    );

    expect(hint()).toContain("maxNetworks=1");
  });
});
