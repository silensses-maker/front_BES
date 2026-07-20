import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClusterMode } from "./cluster-toggle";
import { ClusterToggle } from "./cluster-toggle";

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Keep i18n deterministic without loading the real locale files.
vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Radix Tooltip requires pointer-events which happy-dom doesn't fully provide.
// Replace it with a pass-through so ClusterToggle tests stay focused.
vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ClusterToggle", () => {
  describe("label rendering", () => {
    it("renders both mode buttons", () => {
      render(<ClusterToggle activeMode={null} onToggle={() => undefined} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(2);
      expect(buttons[0]).toHaveTextContent("simulation.canvas.clusterByStrategy");
      expect(buttons[1]).toHaveTextContent("simulation.canvas.clusterByBelief");
    });

    it("applies active styling only to the active mode button", () => {
      render(<ClusterToggle activeMode={"strategy" as ClusterMode} onToggle={() => undefined} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons[0]?.className).toContain("bg-primary/10");
      expect(buttons[1]?.className).not.toContain("bg-primary/10");
    });
  });

  describe("click behaviour", () => {
    it("calls onToggle with 'strategy' when strategy button is clicked", () => {
      const onToggle = vi.fn();
      render(<ClusterToggle activeMode={null} onToggle={onToggle} />);

      fireEvent.click(screen.getAllByRole("button")[0]!);

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith("strategy");
    });

    it("calls onToggle with 'belief' when belief button is clicked", () => {
      const onToggle = vi.fn();
      render(<ClusterToggle activeMode={null} onToggle={onToggle} />);

      fireEvent.click(screen.getAllByRole("button")[1]!);

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith("belief");
    });

    it("does not call onToggle when disabled", () => {
      const onToggle = vi.fn();
      render(<ClusterToggle activeMode={null} onToggle={onToggle} disabled />);

      fireEvent.click(screen.getAllByRole("button")[0]!);

      expect(onToggle).not.toHaveBeenCalled();
    });
  });

  describe("disabled state", () => {
    it("renders all buttons with disabled attribute when disabled=true", () => {
      render(<ClusterToggle activeMode={null} onToggle={() => undefined} disabled />);
      for (const button of screen.getAllByRole("button")) {
        expect(button).toBeDisabled();
      }
    });

    it("renders buttons without disabled attribute by default", () => {
      render(<ClusterToggle activeMode={null} onToggle={() => undefined} />);
      for (const button of screen.getAllByRole("button")) {
        expect(button).not.toBeDisabled();
      }
    });
  });
});
