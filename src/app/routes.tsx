import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "@/app/layouts/dashboard";
import { LandingLayout } from "@/app/layouts/landing";
import { RouteBoundary } from "@/app/routing";
import {
  AboutPage,
  BoardPage,
  ContactPage,
  FaqPage,
  LiveRunPage,
  ProfilePage,
  ResultsPage,
  WikiPage,
} from "@/app/routing/lazy-pages";
import { ProtectedRoute } from "@/features/auth";
// Eager: the entry pages (login, landing home) and the catch-all 404.
import { HomePage } from "@/pages/home/home-page";
import { LoginPage } from "@/pages/login/login-page";
import { NotFoundPage } from "@/pages/not-found/not-found-page";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route index element={<LoginPage />} />

        {/* Public landing shell — LandingLayout owns the Suspense/error boundary of its pages */}
        <Route element={<LandingLayout />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/wiki" element={<WikiPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Catch-all: unknown URLs get the translated 404 inside the landing shell */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Protected app routes — wrapped in DashboardLayout. The guard resolves before any
            page chunk is requested; each lazy page has a RouteBoundary keyed per page. */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* Board panels live in the URL (tabs/breadcrumb derive from it) */}
          <Route path="/board" element={<Navigate to="/board/new-simulation" replace />} />
          {/* Same key on both panels: BoardPage keeps its instance when switching tabs */}
          <Route
            path="/board/new-simulation"
            element={
              <RouteBoundary key="board">
                <BoardPage />
              </RouteBoundary>
            }
          />
          <Route
            path="/board/experiments"
            element={
              <RouteBoundary key="board">
                <BoardPage />
              </RouteBoundary>
            }
          />
          {/* Live-run routes — both point to LiveRunPage; the page handles the
              network-discovery / selector / run-view branching internally. */}
          <Route
            path="/board/simulation/:runId"
            element={
              <RouteBoundary key="live-run">
                <LiveRunPage />
              </RouteBoundary>
            }
          />
          <Route
            path="/board/simulation/:runId/:networkId"
            element={
              <RouteBoundary key="live-run">
                <LiveRunPage />
              </RouteBoundary>
            }
          />
          <Route
            path="/profile"
            element={
              <RouteBoundary key="profile">
                <ProfilePage />
              </RouteBoundary>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
