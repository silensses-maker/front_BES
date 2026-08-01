import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { SimulationWsManager, WsAuthState } from "./simulation-ws-manager";

/**
 * React context for the singleton SimulationWsManager. The context and its
 * consumer hooks live in shared so features/entities can import them without
 * reaching up to the app layer; the app-level <SimulationWsProvider> owns the
 * manager lifecycle and supplies this context.
 */
export const SimulationWsContext = createContext<SimulationWsManager | null>(null);

/**
 * Returns the singleton SimulationWsManager.
 * Must be called under <SimulationWsProvider>.
 */
export function useSimulationWsManager(): SimulationWsManager {
  const manager = useContext(SimulationWsContext);
  if (manager === null) {
    throw new Error("useSimulationWsManager must be used inside <SimulationWsProvider>");
  }
  return manager;
}

/**
 * Reactive WebSocket auth/connection state (idle | connecting | auth_ok |
 * auth_failed | reconnecting). `onAuthStateChange` emits the current state on
 * subscribe and returns an unsubscribe, which makes it a valid
 * useSyncExternalStore source. Used by the header "Reconnecting…" chip.
 */
export function useWsAuthState(): WsAuthState {
  const manager = useSimulationWsManager();
  const subscribe = useCallback(
    (onStoreChange: () => void) => manager.onAuthStateChange(onStoreChange),
    [manager],
  );
  return useSyncExternalStore(subscribe, () => manager.getAuthState());
}
