import { useCallback, useSyncExternalStore } from "react";
import {
  getTopologyLoadStatus,
  subscribeTopologyLoad,
  type TopologyLoadStatus,
} from "../api/topology-loader";

const IDLE: TopologyLoadStatus = { phase: "idle" };
const noop = () => {};

/**
 * Load status of a network's topology (#128): downloading (with its progress), failed, ready or
 * idle — whichever load started the download (prefetch, WS handler, selector or a retry).
 * `networkId` null (waiting for the first network) is always idle.
 */
export function useTopologyLoadStatus(runId: string, networkId: string | null): TopologyLoadStatus {
  const subscribe = useCallback(
    (onChange: () => void) =>
      networkId === null ? noop : subscribeTopologyLoad(runId, networkId, onChange),
    [runId, networkId],
  );
  const getSnapshot = useCallback(
    () => (networkId === null ? IDLE : getTopologyLoadStatus(runId, networkId)),
    [runId, networkId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
