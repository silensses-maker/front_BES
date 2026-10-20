import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { SimulationHistoryPanel } from "./simulation-history-panel";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

type PanelProps = ComponentProps<typeof SimulationHistoryPanel>;

function props(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    runs: [],
    loading: false,
    hasMore: false,
    selectedRunId: null,
    searchQuery: "",
    onSearchChange: vi.fn(),
    statusFilter: "all",
    onFilterChange: vi.fn(),
    statusCounts: { all: 0, running: 0, completed: 0, cancelled: 0, error: 0 },
    typeFilter: "all",
    onTypeFilterChange: vi.fn(),
    dateFrom: "",
    onDateFromChange: vi.fn(),
    dateTo: "",
    onDateToChange: vi.fn(),
    onClearTypeAndDateFilters: vi.fn(),
    pendingCancelRun: null,
    onRequestCancel: vi.fn(),
    onDismissCancel: vi.fn(),
    onConfirmCancel: vi.fn(),
    onSelectRun: vi.fn(),
    onLoadMore: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SimulationHistoryPanel — type and date-range filters (#127)", () => {
  it("reports the date bounds and keeps the range consistent through min/max", () => {
    const onDateFromChange = vi.fn();
    const onDateToChange = vi.fn();
    render(
      <SimulationHistoryPanel
        {...props({
          dateFrom: "2026-01-10",
          dateTo: "2026-02-01",
          onDateFromChange,
          onDateToChange,
        })}
      />,
    );

    const from = screen.getByLabelText("simulationHistory.filterDateFrom");
    const to = screen.getByLabelText("simulationHistory.filterDateTo");
    expect(from).toHaveAttribute("max", "2026-02-01");
    expect(to).toHaveAttribute("min", "2026-01-10");

    fireEvent.change(from, { target: { value: "2026-01-12" } });
    fireEvent.change(to, { target: { value: "2026-01-31" } });

    expect(onDateFromChange).toHaveBeenCalledWith("2026-01-12");
    expect(onDateToChange).toHaveBeenCalledWith("2026-01-31");
  });

  it("offers the clear action only while a type or date filter is active", () => {
    const onClear = vi.fn();
    const { rerender } = render(<SimulationHistoryPanel {...props()} />);
    expect(
      screen.queryByRole("button", { name: "simulationHistory.clearTypeDateFilters" }),
    ).not.toBeInTheDocument();

    rerender(
      <SimulationHistoryPanel
        {...props({ typeFilter: "custom", onClearTypeAndDateFilters: onClear })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "simulationHistory.clearTypeDateFilters" }));
    expect(onClear).toHaveBeenCalledOnce();

    rerender(<SimulationHistoryPanel {...props({ dateTo: "2026-01-31" })} />);
    expect(
      screen.getByRole("button", { name: "simulationHistory.clearTypeDateFilters" }),
    ).toBeInTheDocument();
  });

  it("labels the run type selector", () => {
    render(<SimulationHistoryPanel {...props()} />);

    expect(
      screen.getByRole("combobox", { name: "simulationHistory.filterTypeLabel" }),
    ).toHaveTextContent("simulationHistory.filterTypeAll");
  });
});
