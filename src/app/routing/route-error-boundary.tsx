import { RotateCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "@/shared/i18n";
import { isChunkLoadError } from "@/shared/lib/chunk-load-error";
import { logger } from "@/shared/lib/logger";
import { Button } from "@/shared/ui/button";

type RouteFailure = "chunk" | "render";

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  failure: RouteFailure | null;
}

/**
 * Catches what a lazy page throws instead of letting React unmount the whole
 * app (a white screen). The usual culprit is a chunk that no longer exists —
 * a tab opened before a deploy asking for the previous hashed file names —
 * so a failed chunk gets its own copy; any other render error gets a generic
 * one. Both offer a full reload, which fetches the current index.html.
 *
 * It never resets itself: the owner keys it per route, so navigating to
 * another route mounts a fresh boundary. (React.lazy caches a rejected import,
 * so retrying in place would only rethrow the same error.)
 */
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  override state: RouteErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return { failure: isChunkLoadError(error) ? "chunk" : "render" };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    logger.error("RouteErrorBoundary", { error, componentStack: info.componentStack });
  }

  override render() {
    if (this.state.failure === null) return this.props.children;
    return <RouteErrorFallback failure={this.state.failure} />;
  }
}

function RouteErrorFallback({ failure }: { failure: RouteFailure }) {
  const { t } = useTranslation();
  const isChunk = failure === "chunk";

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center gap-2 text-center"
    >
      <div
        aria-hidden="true"
        className="mb-2 flex size-12 items-center justify-center rounded-full bg-warn/15 text-lg text-warn"
      >
        !
      </div>
      <h1 className="font-sans text-base font-semibold text-foreground">
        {t(isChunk ? "routeBoundary.chunkErrorTitle" : "routeBoundary.errorTitle")}
      </h1>
      <p className="max-w-95 font-sans text-[13px] text-muted-foreground">
        {t(isChunk ? "routeBoundary.chunkErrorBody" : "routeBoundary.errorBody")}
      </p>
      <Button type="button" variant="outline" className="mt-2" onClick={reloadPage}>
        <RotateCw aria-hidden="true" />
        {t("routeBoundary.reload")}
      </Button>
    </div>
  );
}

function reloadPage() {
  window.location.reload();
}
