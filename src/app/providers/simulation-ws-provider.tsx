import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { logger } from "@/shared/lib/logger";
import { SimulationWsManager } from "@/shared/lib/ws-manager";

// ─── Context ──────────────────────────────────────────────────────────────────

interface SimulationWsContextValue {
  manager: SimulationWsManager;
}

const SimulationWsContext = createContext<SimulationWsContextValue | null>(null);

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the singleton SimulationWsManager.
 * Must be called inside <SimulationWsProvider>.
 */
export function useSimulationWsManager(): SimulationWsManager {
  const ctx = useContext(SimulationWsContext);
  if (ctx === null) {
    throw new Error("useSimulationWsManager must be used inside <SimulationWsProvider>");
  }
  return ctx.manager;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface SimulationWsProviderProps {
  children: React.ReactNode;
}

/**
 * Initialises one SimulationWsManager per mount and opens the persistent
 * authenticated WebSocket. Destroys it on unmount.
 *
 * Place this inside the authenticated layout (DashboardLayout) so it only
 * runs while the user has a valid Firebase session.
 */
export function SimulationWsProvider({ children }: SimulationWsProviderProps) {
  // useRef so the manager identity is stable across renders
  const managerRef = useRef<SimulationWsManager | null>(null);

  if (managerRef.current === null) {
    managerRef.current = new SimulationWsManager();
  }

  const manager = managerRef.current;

  // useMemo so the context value object is stable across renders
  const contextValue = useMemo<SimulationWsContextValue>(() => ({ manager }), [manager]);

  useEffect(() => {
    manager.connect().catch((err: unknown) => logger.error("SimulationWsProvider.connect", err));

    return () => {
      manager.destroy();
    };
  }, [manager]);

  return (
    <SimulationWsContext.Provider value={contextValue}>{children}</SimulationWsContext.Provider>
  );
}
