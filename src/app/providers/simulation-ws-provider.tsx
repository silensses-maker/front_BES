import { useEffect, useRef } from "react";
import { logger } from "@/shared/lib/logger";
import { SimulationWsContext, SimulationWsManager } from "@/shared/lib/ws-manager";

interface SimulationWsProviderProps {
  children: React.ReactNode;
}

/**
 * Initialises one SimulationWsManager per mount and opens the persistent
 * authenticated WebSocket. Destroys it on unmount.
 *
 * Owns only the manager LIFECYCLE — the context object and its consumer hooks
 * (useSimulationWsManager, useWsAuthState) live in shared/lib/ws-manager so
 * lower layers never import from app.
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

  useEffect(() => {
    manager.connect().catch((err: unknown) => logger.error("SimulationWsProvider.connect", err));

    return () => {
      manager.destroy();
    };
  }, [manager]);

  return <SimulationWsContext.Provider value={manager}>{children}</SimulationWsContext.Provider>;
}
