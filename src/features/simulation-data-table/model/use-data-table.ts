import { useCallback, useMemo, useState } from "react";
import {
  type AgentFilter,
  type AgentRow,
  agentSortKey,
  DATASET_COLUMNS,
  filterAgentRows,
  filterNetworkRows,
  type NetworkFilter,
  type NetworkRow,
  networkSortKey,
  type PageWindow,
  paginate,
  type RoundRow,
  roundSortKey,
  sortRows,
  type TableDataset,
} from "../lib/table-datasets";

export type PageSize = 25 | 50 | 100;

export interface UseDataTableInput {
  agentRows: AgentRow[];
  roundRows: RoundRow[];
  networkRows: NetworkRow[];
  /** Redes dataset only exists for multi-network runs. */
  hasNetworks: boolean;
  /** Rondas dataset is unavailable in the limited viewer. */
  hasRounds: boolean;
}

export interface UseDataTableReturn {
  dataset: TableDataset;
  availableDatasets: TableDataset[];
  setDataset: (dataset: TableDataset) => void;
  columns: (typeof DATASET_COLUMNS)[TableDataset];
  sortCol: number;
  sortDir: "asc" | "desc";
  toggleSort: (col: number) => void;
  filter: AgentFilter | NetworkFilter;
  setFilter: (filter: AgentFilter | NetworkFilter) => void;
  /** All rows surviving the filter, sorted — the CSV export set. */
  filteredAgentRows: AgentRow[];
  filteredRoundRows: RoundRow[];
  filteredNetworkRows: NetworkRow[];
  filteredCount: number;
  /** Current page slice of the active dataset. */
  pageAgentRows: AgentRow[];
  pageRoundRows: RoundRow[];
  pageNetworkRows: NetworkRow[];
  window: PageWindow;
  pageSize: PageSize;
  setPageSize: (size: PageSize) => void;
  goToPage: (page: number) => void;
}

/**
 * Table state machine (mockup): dataset selector, per-column asc/desc sort
 * (reset on dataset switch), filter pills, 25/50/100 pagination. Row data
 * comes in via props — the page layer wires stores; this hook stays pure.
 */
export function useDataTable(input: UseDataTableInput): UseDataTableReturn {
  const { agentRows, roundRows, networkRows, hasNetworks, hasRounds } = input;

  const [dataset, setDatasetState] = useState<TableDataset>("agents");
  const [sortCol, setSortCol] = useState(0);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<AgentFilter | NetworkFilter>("all");
  const [pageSize, setPageSizeState] = useState<PageSize>(25);
  const [page, setPage] = useState(0);

  const availableDatasets = useMemo(() => {
    const datasets: TableDataset[] = ["agents"];
    if (hasRounds) datasets.push("rounds");
    if (hasNetworks) datasets.push("networks");
    return datasets;
  }, [hasRounds, hasNetworks]);

  // A dataset that becomes unavailable (e.g. network switch) falls back safely
  const activeDataset = availableDatasets.includes(dataset) ? dataset : "agents";

  const setDataset = useCallback((next: TableDataset) => {
    setDatasetState(next);
    setSortCol(0);
    setSortDir("asc");
    setFilter("all");
    setPage(0);
  }, []);

  const toggleSort = useCallback((col: number) => {
    setSortCol((prevCol) => {
      setSortDir((prevDir) => (prevCol === col && prevDir === "asc" ? "desc" : "asc"));
      return col;
    });
    setPage(0);
  }, []);

  const filteredAgentRows = useMemo(() => {
    if (activeDataset !== "agents") return [];
    const filtered = filterAgentRows(agentRows, filter as AgentFilter);
    return sortRows(filtered, agentSortKey, sortCol, sortDir);
  }, [activeDataset, agentRows, filter, sortCol, sortDir]);

  const filteredRoundRows = useMemo(() => {
    if (activeDataset !== "rounds") return [];
    return sortRows(roundRows, roundSortKey, sortCol, sortDir);
  }, [activeDataset, roundRows, sortCol, sortDir]);

  const filteredNetworkRows = useMemo(() => {
    if (activeDataset !== "networks") return [];
    const filtered = filterNetworkRows(networkRows, filter as NetworkFilter);
    return sortRows(filtered, networkSortKey, sortCol, sortDir);
  }, [activeDataset, networkRows, filter, sortCol, sortDir]);

  const filteredCount =
    activeDataset === "agents"
      ? filteredAgentRows.length
      : activeDataset === "rounds"
        ? filteredRoundRows.length
        : filteredNetworkRows.length;

  const window = paginate(filteredCount, page, pageSize);

  return {
    dataset: activeDataset,
    availableDatasets,
    setDataset,
    columns: DATASET_COLUMNS[activeDataset],
    sortCol,
    sortDir,
    toggleSort,
    filter,
    setFilter: useCallback((next: AgentFilter | NetworkFilter) => {
      setFilter(next);
      setPage(0);
    }, []),
    filteredAgentRows,
    filteredRoundRows,
    filteredNetworkRows,
    filteredCount,
    pageAgentRows: filteredAgentRows.slice(window.from, window.to),
    pageRoundRows: filteredRoundRows.slice(window.from, window.to),
    pageNetworkRows: filteredNetworkRows.slice(window.from, window.to),
    window,
    pageSize,
    setPageSize: useCallback((size: PageSize) => {
      setPageSizeState(size);
      setPage(0);
    }, []),
    goToPage: setPage,
  };
}
