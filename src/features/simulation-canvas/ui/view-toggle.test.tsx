import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ViewToggle } from "./view-toggle";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Radix Tooltip needs pointer-events happy-dom doesn't fully provide — pass-through.
vi.mock("@/shared/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <span>{children}</span>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ViewToggle", () => {
  it("renders both Initial and Final buttons", () => {
    render(<ViewToggle view="initial" onChange={() => undefined} finalEnabled />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("simulation.canvas.viewInitial");
    expect(buttons[1]).toHaveTextContent("simulation.canvas.viewFinal");
  });

  it("applies active styling only to the active view", () => {
    render(<ViewToggle view="final" onChange={() => undefined} finalEnabled />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]?.className).not.toContain("bg-primary/10");
    expect(buttons[1]?.className).toContain("bg-primary/10");
  });

  it("calls onChange with 'final' when the Final button is clicked", () => {
    const onChange = vi.fn();
    render(<ViewToggle view="initial" onChange={onChange} finalEnabled />);

    fireEvent.click(screen.getByText("simulation.canvas.viewFinal"));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("final");
  });

  it("calls onChange with 'initial' when the Initial button is clicked", () => {
    const onChange = vi.fn();
    render(<ViewToggle view="final" onChange={onChange} finalEnabled />);

    fireEvent.click(screen.getByText("simulation.canvas.viewInitial"));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("initial");
  });

  it("disables the Final button and does not fire onChange when finalEnabled is false", () => {
    const onChange = vi.fn();
    render(<ViewToggle view="initial" onChange={onChange} finalEnabled={false} />);

    const finalButton = screen.getByText("simulation.canvas.viewFinal").closest("button")!;
    expect(finalButton).toBeDisabled();

    fireEvent.click(finalButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the Initial button enabled even when finalEnabled is false", () => {
    render(<ViewToggle view="initial" onChange={() => undefined} finalEnabled={false} />);
    const initialButton = screen.getByText("simulation.canvas.viewInitial").closest("button")!;
    expect(initialButton).not.toBeDisabled();
  });
});
