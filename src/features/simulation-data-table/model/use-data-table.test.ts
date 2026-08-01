import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AgentRow, NetworkRow, RoundRow } from "../lib/table-datasets";
import { useDataTable } from "./use-data-table";

function agentRow(index: number, speaking: boolean, publicBelief: number): AgentRow {
  return {
    index,
    name: null,
    strategy: 0,
    effect: 0,
    publicBelief,
    privateBelief: publicBelief,
    divergence: 0,
    speaking,
    degreeIn: 0,
    degreeOut: 0,
  };
}

const AGENTS: AgentRow[] = Array.from({ length: 60 }, (_, i) => agentRow(i, i % 2 === 0, i / 100));
const ROUNDS: RoundRow[] = Array.from({ length: 5 }, (_, i) => ({
  round: i,
  meanPublic: i / 10,
  meanPrivate: i / 10,
  spread: 0.1,
  participation: 1,
}));
const NETWORKS: NetworkRow[] = [
  { ordinal: 1, networkId: "n1", consensus: true, finalRound: 10, finalSpread: 0.1 },
  { ordinal: 2, networkId: "n2", consensus: false, finalRound: 90, finalSpread: 0.5 },
];

function renderTable(overrides?: Partial<Parameters<typeof useDataTable>[0]>) {
  return renderHook(() =>
    useDataTable({
      agentRows: AGENTS,
      roundRows: ROUNDS,
      networkRows: NETWORKS,
      hasNetworks: true,
      hasRounds: true,
      ...overrides,
    }),
  );
}

describe("useDataTable", () => {
  it("defaults to the agents dataset sorted by the first column ascending", () => {
    const { result } = renderTable();
    expect(result.current.dataset).toBe("agents");
    expect(result.current.pageAgentRows[0]?.index).toBe(0);
    expect(result.current.filteredCount).toBe(60);
    expect(result.current.window).toEqual({ page: 0, pages: 3, from: 0, to: 25 });
  });

  it("exposes only available datasets", () => {
    const { result } = renderTable({ hasNetworks: false, hasRounds: false });
    expect(result.current.availableDatasets).toEqual(["agents"]);
  });

  it("toggleSort flips direction on the same column and resets on a new one", () => {
    const { result } = renderTable();
    act(() => result.current.toggleSort(4));
    expect(result.current.sortDir).toBe("asc");
    expect(result.current.sortCol).toBe(4);
    act(() => result.current.toggleSort(4));
    expect(result.current.sortDir).toBe("desc");
    expect(result.current.pageAgentRows[0]?.index).toBe(59);
    act(() => result.current.toggleSort(0));
    expect(result.current.sortDir).toBe("asc");
  });

  it("filter narrows rows and resets the page", () => {
    const { result } = renderTable();
    act(() => result.current.goToPage(2));
    expect(result.current.window.page).toBe(2);
    act(() => result.current.setFilter("silent"));
    expect(result.current.filteredCount).toBe(30);
    expect(result.current.window.page).toBe(0);
    expect(result.current.pageAgentRows.every((row) => row.speaking === false)).toBe(true);
  });

  it("switching dataset resets sort, filter and page", () => {
    const { result } = renderTable();
    act(() => {
      result.current.setFilter("speaking");
      result.current.toggleSort(4);
      result.current.goToPage(1);
    });
    act(() => result.current.setDataset("rounds"));
    expect(result.current.dataset).toBe("rounds");
    expect(result.current.sortCol).toBe(0);
    expect(result.current.filter).toBe("all");
    expect(result.current.window.page).toBe(0);
    expect(result.current.pageRoundRows).toHaveLength(5);
  });

  it("falls back to agents when the active dataset disappears", () => {
    const { result, rerender } = renderHook(
      ({ hasNetworks }: { hasNetworks: boolean }) =>
        useDataTable({
          agentRows: AGENTS,
          roundRows: ROUNDS,
          networkRows: NETWORKS,
          hasNetworks,
          hasRounds: true,
        }),
      { initialProps: { hasNetworks: true } },
    );
    act(() => result.current.setDataset("networks"));
    expect(result.current.dataset).toBe("networks");
    rerender({ hasNetworks: false });
    expect(result.current.dataset).toBe("agents");
  });

  it("page size change reslices and resets the page", () => {
    const { result } = renderTable();
    act(() => result.current.goToPage(2));
    act(() => result.current.setPageSize(50));
    expect(result.current.window).toEqual({ page: 0, pages: 2, from: 0, to: 50 });
    expect(result.current.pageAgentRows).toHaveLength(50);
  });
});
