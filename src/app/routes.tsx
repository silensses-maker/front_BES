import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "@/app/layouts/dashboard";
import { LandingLayout } from "@/app/layouts/landing";
import { ProtectedRoute } from "@/features/auth";
import { BoardPage, HomePage, LiveRunPage, ProfilePage, ResultsPage, WikiPage } from "@/pages";
import { LoginPage } from "@/pages/login/login-page";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route index element={<LoginPage />} />

        {/* Public landing shell */}
        <Route element={<LandingLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/wiki" element={<WikiPage />} />
          <Route path="/results" element={<ResultsPage />} />
        </Route>

        {/* Protected app routes — wrapped in DashboardLayout */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* Board panels live in the URL (tabs/breadcrumb derive from it) */}
          <Route path="/board" element={<Navigate to="/board/new-simulation" replace />} />
          <Route path="/board/new-simulation" element={<BoardPage />} />
          <Route path="/board/experiments" element={<BoardPage />} />
          {/* Live-run routes — both point to LiveRunPage; the page handles the
              network-discovery / selector / run-view branching internally. */}
          <Route path="/board/simulation/:runId" element={<LiveRunPage />} />
          <Route path="/board/simulation/:runId/:networkId" element={<LiveRunPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<div>404 - Not Found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
