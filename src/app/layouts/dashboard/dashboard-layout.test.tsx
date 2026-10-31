import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DashboardLayout } from "./dashboard-layout";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/app/providers/simulation-ws-provider", () => ({
  SimulationWsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("./dashboard-header", () => ({
  DashboardHeader: ({ sidebarAvailable }: { sidebarAvailable?: boolean }) => (
    <header data-testid="header" data-sidebar-available={String(sidebarAvailable)} />
  ),
}));

vi.mock("./dashboard-sidebar", () => ({
  DashboardSidebar: () => <aside data-testid="sidebar" />,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/board/new-simulation" element={<p>board page</p>} />
          <Route path="/board/experiments" element={<p>experiments page</p>} />
          <Route path="/profile" element={<p>profile page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardLayout", () => {
  it("renders the sidebar on board routes and tells the header it is available", () => {
    renderAt("/board/new-simulation");
    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("header")).toHaveAttribute("data-sidebar-available", "true");
    expect(screen.getByText("board page")).toBeInTheDocument();
  });

  it("renders no sidebar outside the board (profile)", () => {
    renderAt("/profile");
    expect(screen.queryByTestId("sidebar")).not.toBeInTheDocument();
    expect(screen.getByTestId("header")).toHaveAttribute("data-sidebar-available", "false");
    expect(screen.getByText("profile page")).toBeInTheDocument();
  });
});
