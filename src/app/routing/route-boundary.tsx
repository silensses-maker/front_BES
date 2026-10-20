import { type ReactNode, Suspense } from "react";
import { RouteErrorBoundary } from "./route-error-boundary";
import { RouteFallback } from "./route-fallback";

/**
 * Boundary for lazily loaded pages: the loading fallback while the chunk is
 * in flight and the reload UI if it fails.
 *
 * Give it a `key` per route. Navigation runs inside a transition (React
 * Router), and a transition keeps an already revealed boundary on the old
 * page until the new chunk arrives; a fresh key mounts a new boundary, so the
 * fallback shows right away and a previous route's error does not stick. Key
 * by route, not by URL, when one page serves several URLs (e.g. the live run
 * with and without a network id) so the page is not remounted between them.
 */
export function RouteBoundary({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}
