import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { SimulationWsProvider } from "@/app/providers/simulation-ws-provider";
import { cn } from "@/shared/lib/utils";
import type { DashboardOutletContext, SidebarPanel } from "@/shared/types/dashboard";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";

/** Shape passed to child pages via React Router OutletContext — lives in
 *  shared/types so pages import it downward instead of reaching into app. */
export type { DashboardOutletContext } from "@/shared/types/dashboard";

/**
 * DashboardLayout — three-region shell: Sidebar (left) + Header (top) + MainContent.
 *
 * State managed here (single source of truth for the shell):
 *  - sidebarCollapsed: whether the sidebar is in icon-only mode
 *  - fullscreen:       whether the sidebar is completely hidden for visualization focus
 *  - sidebarContent:  ReactNode injected by the page via OutletContext.setSidebarContent
 *
 * The active panel lives in the URL (/board/new-simulation | /board/experiments)
 * so tabs, sidebar title and breadcrumb all derive from one navigable source.
 * No business logic lives here — only structural toggle mechanics.
 */
export function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarContent, setSidebarContent] = useState<ReactNode>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activePanel: SidebarPanel = pathname.startsWith("/board/experiments")
    ? "my-experiments"
    : "new-simulation";
  const setActivePanel = (panel: SidebarPanel) =>
    navigate(panel === "my-experiments" ? "/board/experiments" : "/board/new-simulation");

  const handleSidebarToggle = () => setSidebarCollapsed((prev) => !prev);
  const handleFullscreenToggle = () => setFullscreen((prev) => !prev);

  const outletContext: DashboardOutletContext = {
    activePanel,
    setSidebarContent,
  };

  return (
    <SimulationWsProvider>
      <motion.div
        className="flex h-screen flex-col bg-background"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* ── Top header (full width, sticky) ──────────────────── */}
        <DashboardHeader
          onPanelChange={setActivePanel}
          fullscreen={fullscreen}
          onFullscreenToggle={handleFullscreenToggle}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={handleSidebarToggle}
        />

        {/* ── Body row: Sidebar + MainContent ──────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — slides out when entering fullscreen mode */}
          <AnimatePresence initial={false}>
            {!fullscreen && (
              <motion.div
                key="sidebar"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="shrink-0 self-stretch"
              >
                <DashboardSidebar
                  collapsed={sidebarCollapsed}
                  activePanel={activePanel}
                  onToggle={handleSidebarToggle}
                  onPanelChange={setActivePanel}
                  panelContent={sidebarContent}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main content — disappears instantly, reappears after layout settles */}
          <main
            id="dashboard-main-content"
            tabIndex={-1}
            className={cn(
              "flex-1 overflow-auto p-4 focus-visible:outline-none md:p-6",
              fullscreen && "p-0 md:p-0",
            )}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={fullscreen ? "fullscreen" : "normal"}
                className="h-full"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: 0.25, ease: "easeOut", delay: 0.2 },
                }}
                exit={{ opacity: 0, transition: { duration: 0.05 } }}
              >
                <Outlet context={outletContext} />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </motion.div>
    </SimulationWsProvider>
  );
}
