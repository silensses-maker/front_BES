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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<ClusterMode, string> = {
  strategy: "simulation.canvas.clusterByStrategy",
  belief: "simulation.canvas.clusterByBelief",
  effect: "simulation.canvas.clusterByEffect",
};

const ALL_MODES = Object.keys(MODE_LABELS) as ClusterMode[];

function getModeButton(mode: ClusterMode): HTMLElement {
  return screen.getByRole("button", { name: MODE_LABELS[mode] });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ClusterToggle", () => {
  describe("label rendering", () => {
    it("renders one button per clustering axis", () => {
      render(<ClusterToggle activeMode={null} onToggle={() => undefined} />);
      expect(screen.getAllByRole("button")).toHaveLength(ALL_MODES.length);
      for (const mode of ALL_MODES) {
        expect(getModeButton(mode)).toBeInTheDocument();
      }
    });

    it("applies active styling only to the active mode button", () => {
      render(<ClusterToggle activeMode="strategy" onToggle={() => undefined} />);
      expect(getModeButton("strategy").className).toContain("bg-primary/10");
      expect(getModeButton("belief").className).not.toContain("bg-primary/10");
      expect(getModeButton("effect").className).not.toContain("bg-primary/10");
    });
  });

  describe("click behaviour", () => {
    it.each(ALL_MODES)("calls onToggle with '%s' when its button is clicked", (mode) => {
      const onToggle = vi.fn();
      render(<ClusterToggle activeMode={null} onToggle={onToggle} />);

      fireEvent.click(getModeButton(mode));

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(onToggle).toHaveBeenCalledWith(mode);
    });

    it("does not call onToggle when disabled", () => {
      const onToggle = vi.fn();
      render(<ClusterToggle activeMode={null} onToggle={onToggle} disabled />);

      fireEvent.click(getModeButton("strategy"));

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
