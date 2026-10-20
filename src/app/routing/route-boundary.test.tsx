import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentType, lazy } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/shared/i18n";
import en from "@/shared/i18n/locales/en";
import es from "@/shared/i18n/locales/es";
import { RouteBoundary } from "./route-boundary";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A lazy page whose import the test settles by hand. */
function deferredPage() {
  let resolve!: (module: { default: ComponentType }) => void;
  let reject!: (error: unknown) => void;
  const Page = lazy(
    () =>
      new Promise<{ default: ComponentType }>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return {
    Page,
    resolve: (C: ComponentType) => resolve({ default: C }),
    reject: (e: unknown) => reject(e),
  };
}

/** The error Rspack's runtime rejects a lazy import with when the chunk is gone. */
function chunkLoadError(): Error {
  const error = new Error("Loading chunk 412 failed.\n(missing: /static/js/async/412.js)");
  error.name = "ChunkLoadError";
  return error;
}

function Boom(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'map')");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.each([
  ["en", en],
  ["es", es],
] as const)("RouteBoundary (%s)", (lng, locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(lng);
    // React reports the errors a boundary catches; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows the loading fallback while the page chunk resolves, then the page", async () => {
    const { Page, resolve } = deferredPage();
    render(
      <RouteBoundary>
        <Page />
      </RouteBoundary>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(locale.routeBoundary.loading);

    await act(async () => resolve(() => <h1>Lazy page</h1>));

    expect(await screen.findByRole("heading", { name: "Lazy page" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the reload UI instead of a blank screen when the chunk fails to load", async () => {
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
    const { Page, reject } = deferredPage();
    render(
      <RouteBoundary>
        <Page />
      </RouteBoundary>,
    );

    await act(async () => reject(chunkLoadError()));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(locale.routeBoundary.chunkErrorTitle);
    expect(alert).toHaveTextContent(locale.routeBoundary.chunkErrorBody);
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: locale.routeBoundary.reload }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("uses the generic copy for an error that is not a chunk failure", () => {
    render(
      <RouteBoundary>
        <Boom />
      </RouteBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(locale.routeBoundary.errorTitle);
    expect(alert).toHaveTextContent(locale.routeBoundary.errorBody);
    expect(screen.getByRole("button", { name: locale.routeBoundary.reload })).toBeInTheDocument();
  });
});
