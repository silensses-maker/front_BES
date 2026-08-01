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

const OPTION_LABELS: Record<string, string> = {
  none: "runView.groupNone",
  strategy: "runView.groupStrategy",
  belief: "runView.groupBelief",
  effect: "runView.groupEffect",
};

const CLUSTER_MODES: ClusterMode[] = ["strategy", "belief", "effect"];

function getOptionButton(option: string): HTMLElement {
  return screen.getByRole("button", { name: OPTION_LABELS[option] ?? option });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ClusterToggle", () => {
  describe("label rendering", () => {
    it("renders Ninguno plus one button per clustering axis", () => {
      render(<ClusterToggle activeMode={null} onChange={() => undefined} />);
      expect(screen.getAllByRole("button")).toHaveLength(4);
      for (const option of Object.keys(OPTION_LABELS)) {
        expect(getOptionButton(option)).toBeInTheDocument();
      }
    });

    it("marks Ninguno active when no cluster mode is set", () => {
      render(<ClusterToggle activeMode={null} onChange={() => undefined} />);
      expect(getOptionButton("none").className).toContain("text-primary");
      expect(getOptionButton("strategy").className).not.toContain("text-primary");
    });

    it("applies active styling only to the active mode button", () => {
      render(<ClusterToggle activeMode="strategy" onChange={() => undefined} />);
      expect(getOptionButton("strategy").className).toContain("text-primary");
      expect(getOptionButton("none").className).not.toContain("text-primary");
      expect(getOptionButton("belief").className).not.toContain("text-primary");
    });
  });

  describe("click behaviour", () => {
    it.each(CLUSTER_MODES)("calls onChange with '%s' when its button is clicked", (mode) => {
      const onChange = vi.fn();
      render(<ClusterToggle activeMode={null} onChange={onChange} />);

      fireEvent.click(getOptionButton(mode));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(mode);
    });

    it("calls onChange with null when Ninguno is clicked", () => {
      const onChange = vi.fn();
      render(<ClusterToggle activeMode="belief" onChange={onChange} />);

      fireEvent.click(getOptionButton("none"));

      expect(onChange).toHaveBeenCalledWith(null);
    });

    it("does not call onChange when disabled", () => {
      const onChange = vi.fn();
      render(<ClusterToggle activeMode={null} onChange={onChange} disabled />);

      fireEvent.click(getOptionButton("strategy"));

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("belief suspended during playback", () => {
    it("disables ONLY the belief button when beliefDisabled=true", () => {
      const onChange = vi.fn();
      render(<ClusterToggle activeMode={null} onChange={onChange} beliefDisabled />);

      expect(getOptionButton("belief")).toBeDisabled();
      expect(getOptionButton("none")).not.toBeDisabled();
      expect(getOptionButton("strategy")).not.toBeDisabled();
      expect(getOptionButton("effect")).not.toBeDisabled();

      fireEvent.click(getOptionButton("belief"));
      expect(onChange).not.toHaveBeenCalled();
      fireEvent.click(getOptionButton("strategy"));
      expect(onChange).toHaveBeenCalledWith("strategy");
    });
  });

  describe("disabled state", () => {
    it("renders all buttons with disabled attribute when disabled=true", () => {
      render(<ClusterToggle activeMode={null} onChange={() => undefined} disabled />);
      for (const button of screen.getAllByRole("button")) {
        expect(button).toBeDisabled();
      }
    });

    it("renders buttons without disabled attribute by default", () => {
      render(<ClusterToggle activeMode={null} onChange={() => undefined} />);
      for (const button of screen.getAllByRole("button")) {
        expect(button).not.toBeDisabled();
      }
    });
  });
});
