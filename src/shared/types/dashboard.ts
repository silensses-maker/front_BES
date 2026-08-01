import type { ReactNode } from "react";

/** Which top-level panel the dashboard sidebar should render. */
export type SidebarPanel = "new-simulation" | "my-experiments";

/**
 * Contract between the dashboard layout (app layer) and the pages it hosts,
 * passed through React Router's Outlet context. Lives in shared so both sides
 * import downward — pages must never reach up into app.
 */
export interface DashboardOutletContext {
  activePanel: SidebarPanel;
  setSidebarContent: (content: ReactNode) => void;
}
