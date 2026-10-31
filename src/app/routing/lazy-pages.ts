import { lazy } from "react";

/**
 * Route-level code splitting (#130): each page below is its own async chunk,
 * fetched the first time its route renders. The entry keeps only what the
 * first page a visitor opens needs (login, landing home, 404, both shells and
 * the auth guard); Cosmograph + DuckDB-WASM and ECharts are reachable only
 * from the live-run chunk.
 *
 * Import pages by module path, never through a pages barrel: a single static
 * import of a barrel from an eager module pulls every page and its vendors
 * back into the entry. The chunk names are for the build output and the
 * network panel.
 */

// ── Public content pages (landing shell) ──────────────────────────────────────

export const WikiPage = lazy(() =>
  import(/* webpackChunkName: "page-wiki" */ "@/pages/wiki/wiki-page").then((m) => ({
    default: m.WikiPage,
  })),
);

/** The user manual (`/docs`, `/docs/:section`); each section's MDX is its own chunk again. */
export const DocsPage = lazy(() =>
  import(/* webpackChunkName: "page-docs" */ "@/pages/docs/docs-page").then((m) => ({
    default: m.DocsPage,
  })),
);

export const ResultsPage = lazy(() =>
  import(/* webpackChunkName: "page-results" */ "@/pages/results/results-page").then((m) => ({
    default: m.ResultsPage,
  })),
);

export const FaqPage = lazy(() =>
  import(/* webpackChunkName: "page-faq" */ "@/pages/faq/faq-page").then((m) => ({
    default: m.FaqPage,
  })),
);

export const ContactPage = lazy(() =>
  import(/* webpackChunkName: "page-contact" */ "@/pages/contact/contact-page").then((m) => ({
    default: m.ContactPage,
  })),
);

export const AboutPage = lazy(() =>
  import(/* webpackChunkName: "page-about" */ "@/pages/about/about-page").then((m) => ({
    default: m.AboutPage,
  })),
);

// ── Protected pages (dashboard shell) ─────────────────────────────────────────

export const BoardPage = lazy(() =>
  import(/* webpackChunkName: "page-board" */ "@/pages/board/board-page").then((m) => ({
    default: m.BoardPage,
  })),
);

/** The only route that renders the simulation canvas (Cosmograph) and the run charts (ECharts). */
export const LiveRunPage = lazy(() =>
  import(/* webpackChunkName: "page-live-run" */ "@/pages/live-run").then((m) => ({
    default: m.LiveRunPage,
  })),
);

export const ProfilePage = lazy(() =>
  import(/* webpackChunkName: "page-profile" */ "@/pages/profile/profile-page").then((m) => ({
    default: m.ProfilePage,
  })),
);
// ── Benchmark harness (#126) ──────────────────────────────────────────────────

/**
 * /bench suite page — only in benchmark builds (`PUBLIC_BENCHMARK=true`). `__BENCHMARK__` is a
 * build-time literal: in a normal build this is `null` and the dynamic import is dead code, so
 * no chunk is emitted.
 */
export const BenchPage = __BENCHMARK__
  ? lazy(() =>
      import(/* webpackChunkName: "page-bench" */ "@/pages/bench").then((m) => ({
        default: m.BenchPage,
      })),
    )
  : null;
