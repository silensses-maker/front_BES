# SiLEnSeSS v2.0.0-alpha.1

**S**imulat**i**on **L**aboratory of the **E**volution of Opi**n**ion in **S**ocial N**e**tworks under the influence of the **S**piral of **S**ilence.
A multi-agent simulator that models opinion dynamics by incorporating the **Spiral of Silence** theory — exploring not just *what* people think, but *whether they say it*.

> ⚠️ **Alpha release** — Active development. Expect breaking changes.

---

## About the Project

Traditional models of opinion formation (like DeGroot) assume all agents express their opinions at every time step. In reality, people may choose *not* to speak — especially if they perceive their view as unpopular.

SiLEnSeSS extends classic opinion dynamics with two novel model families:

### SOM⁻ (Memoryless)

Silent agents are ignored. When updating opinions, agents only average the opinions of neighbors who are **currently speaking**. This reveals how "bridge" agents between communities can become perpetually silent, splitting the network.

### SOM⁺ (Memory-based)

Agents **remember** the last known opinion of silent neighbors. This can lead to **"Hidden Consensus"** — where private opinions converge but public discourse remains polarized because agents perceive outdated disagreement.

### Key Parameters

| Symbol | Name | Description |
|--------|------|-------------|
| Bᵢᵗ | Opinion | Agent *i*'s opinion at time *t*, in [0, 1] |
| Iⱼᵢ | Influence | Strength of influence agent *j* has on agent *i* |
| Sᵢᵗ | Silence State | 1 = speaking, 0 = silent |
| τᵢ | Tolerance Radius | How "close" an opinion must be to feel supportive |
| Mᵢ | Majority Threshold | Minimum proportion of supportive neighbors to speak |
| pubBⱼᵗ | Public Opinion | Last opinion publicly expressed by agent *j* (SOM⁺ only) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime & Package Manager | [Bun](https://bun.sh/) |
| Build Tool | [Rsbuild](https://rsbuild.dev/) (Rspack) |
| Framework | React 18 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/) |
| Routing | React Router v6 |
| State Management | Zustand |
| HTTP Client | Axios |
| User manual | [MDX](https://mdxjs.com/) 3 (`@rsbuild/plugin-mdx`; `@mdx-js/rollup` in Vitest) |
| Linting & Formatting | [Biome](https://biomejs.dev/) |
| Testing | Vitest + Testing Library + happy-dom |
| Build Analysis | Rsdoctor |

---

## Architecture: Feature-Sliced Design (FSD)

The project follows [Feature-Sliced Design](https://feature-sliced.design/), organizing code by domain rather than by file type.

```
src/
├── app/              # App initialization, providers, routes
├── pages/            # Page compositions (route-level)
├── widgets/          # Large UI blocks (header, sidebar, footer)
├── features/         # User interactions & business logic
│   ├── cosmograph/
│   └── users/
├── entities/         # Business models (user, agent, simulation)
└── shared/           # Shared code (UI kit, utils, API config)
    ├── ui/           # shadcn/ui components
    ├── lib/          # Utilities (cn, helpers)
    ├── styles/       # Global CSS, Tailwind theme
    └── hooks/        # Shared hooks
```

### Import Rules

Layers can only import from layers **below** them:

```
app → pages → widgets → features → entities → shared
```

`shared` does not import from any other layer.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) ≥ 1.0

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd front_BES

# Install dependencies
bun install
```

### Development

```bash
bun run dev           # Start dev server on :3000
```

### Local auth emulator

For local development without a real Google account, `bun run dev` can sign in against the
[Firebase Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth) instead of
Firebase Auth. The emulator issues test accounts from its own sign-in page (the usual Google pop-up
becomes the emulator's account chooser: **Add new account** creates one), and its users live only
while it runs.

1. Start the emulator (Firebase CLI, through `bunx`). Use the **same project id** as the frontend's
   `PUBLIC_FIREBASE_PROJECT_ID` and the backend's `FIREBASE_PROJECT_ID`: the emulator's tokens carry
   it as their audience, and the backend checks it. A minimal config outside the repo keeps the
   Emulator UI off (its default port, 4000, is often taken):

   ```jsonc
   // e.g. ~/firebase-emulator/firebase.json
   {
     "emulators": {
       "auth": { "host": "127.0.0.1", "port": 9099 },
       "ui": { "enabled": false }
     }
   }
   ```

   ```bash
   bunx firebase-tools emulators:start --only auth \
     --config ~/firebase-emulator/firebase.json --project <PUBLIC_FIREBASE_PROJECT_ID>
   ```

2. Point the frontend at it, in `.env.local` (never in `.env.production`):

   ```bash
   PUBLIC_AUTH_EMULATOR=true
   # PUBLIC_AUTH_EMULATOR_URL=http://127.0.0.1:9099   # the default
   ```

   and run `bun run dev`. The Firebase SDK logs that it is in emulator mode and shows its banner at
   the bottom of the page.

3. Point the backend at it: in the backend's `.env`, `FIREBASE_AUTH_EMULATOR_HOST` is the
   emulator's `host:port` **without** `http://`, as the backend container sees it (the dev
   `docker-compose.yml` passes it through; empty = real Firebase Auth). With Docker Desktop that is
   `host.docker.internal:9099`, and the emulator must listen on an address the container can reach
   (set `"host": "0.0.0.0"` in the config above). The Firebase Admin SDK then accepts the
   emulator's unsigned tokens, so this is **never** for a shared or production backend. New
   accounts start as Guest, as usual; `BOOTSTRAP_ADMIN_EMAILS` still applies.

Safety: `__AUTH_EMULATOR__` (`rsbuild.config.ts`) is a build-time literal that is `true` only in a
development build (`rsbuild dev`) with `PUBLIC_AUTH_EMULATOR=true`. `bun run build` ignores the
variable (with a warning) and compiles the emulator call out, CI and Vercel builds refuse it, and
Vitest compiles it to `false`. A production build has no emulator code:

```bash
bun run build && grep -rl connectAuthEmulator dist/ || echo "no emulator code"
```

### Build & Preview

```bash
bun run build         # Production build
bun run preview       # Preview the build locally
bun run doctor        # Build analysis with Rsdoctor
```

### Code Quality

```bash
bun run check         # Lint + format + organize imports (all-in-one)
bun run lint          # Linting only
bun run format        # Formatting only
```

### Testing

```bash
bun run test          # Watch mode
bun run test:ui       # Vitest UI
bun run test:coverage # Coverage report (threshold: 80%)
```

---

## Adding UI Components

This project uses [shadcn/ui](https://ui.shadcn.com/) with manual installation (Rsbuild is not auto-detected by the CLI).

```bash
# Add a component
bunx shadcn@latest add button

# Add multiple components
bunx shadcn@latest add card table tabs separator
```

Components are placed in `src/shared/ui/` following FSD conventions.

---

## Project Configuration

### TypeScript

- **Target:** ES2020 | **Module:** ESNext | **JSX:** react-jsx
- `noUncheckedIndexedAccess: true` — arrays return `T | undefined`
- `verbatimModuleSyntax: true` — requires explicit `import type`
- Path alias: `@/` → `./src/`

### Biome

Replaces ESLint + Prettier (~100x faster). Key rules:

- Indent: 2 spaces | Line width: 100 | Double quotes | Trailing commas | Semicolons
- `noUnusedImports: error` | `noExplicitAny: warn` | `useSelfClosingElements: error`

### Tailwind CSS v4

- Configured via `@tailwindcss/postcss` (see `postcss.config.mjs`)
- Theme variables defined in `src/shared/styles/globals.css`
- Base color: **zinc** (OKLCH format)
- Dark mode ready via `.dark` class
- Text contrast: the dark theme's text tokens meet WCAG AA, and its secondary text (`--muted-foreground`) reaches ≥ 7:1 on the page, card and sidebar; `src/shared/styles/theme-contrast.test.ts` guards them. Don't lower secondary text with opacity modifiers (`text-muted-foreground/60`…): use `text-muted-foreground` as is

### Vitest

- Environment: happy-dom (3-5x faster than jsdom)
- Globals enabled (no need to import `describe`, `it`, `expect`)
- Coverage thresholds: 80% across statements, branches, functions, and lines

---

## Polarization measures

The run view's **Polarization** chart shows, round by round, a polarization measure of the agents'
beliefs computed **on the server by the real Python package**
[pol_measures](https://github.com/ulvenforst/pol_measures) (PROMUEVA; package author Juan Camilo
Narváez Tascón, BiPol implemented by Carlos Pinzón; MEC paper
[arXiv:2606.13997](https://arxiv.org/abs/2606.13997)), pinned to a commit in the backend image
(currently [`0e05564`](https://github.com/ulvenforst/pol_measures/tree/0e05564ed0b7b23de368dd19becac3a1de4ef745)).
pol_measures is GPL-3.0 upstream and is used with its authors' permission (members of PROMUEVA);
the backend installs it unmodified. Nothing is computed in the browser: the client only builds the
histograms.

- Per round, the aggregates pipeline keeps one 210-bin histogram per belief type (210 = LCM of 3, 5,
  7 and 10; `src/shared/lib/polarization/`), so any k is an exact rebinning.
- `GET /simulations/polarization/measures` gives the catalog (measures, parameters with the
  package's defaults and ranges, the k each supports — Experts only 5 —, thresholds, the f(d)
  options, limits, versions); it is fetched once per session (`run-polarization/model/polarization-catalog.store.ts`).
- `POST /simulations/polarization` gets the k-category agent counts of each round and answers one
  value, level and error per round (`run-polarization/model/polarization-series.ts`). Requests are
  debounced while parameters are edited, results are cached per run / network, measure, parameters,
  k and belief type, and a live run only sends its new rounds, at most every 2 s (5000 rounds per
  request while catching up).
- Up to ten series (one per measure of the package) can be overlaid to compare them, each with its
  own measure, parameters, k and belief type (`run-polarization/model/series-list.ts`); "Overlay all
  measures" replaces them with every measure defined for the selected series' k, with the package's
  defaults (an Undo restores the previous series). Series are told apart by color and line style:
  four colors, solid then dashed then dotted, with sparse markers on the dashed and dotted lines
  (`run-polarization/lib/series-style.ts`). Their requests go one at a time, round-robin
  (`run-polarization/model/series-scheduler.ts`), with the same chunking, debounce and cache. With
  several series the chart has no thresholds, a legend up to four series (more are identified by
  the chips above it), and its y axis can show each series normalized to its own min–max
  ("Normalized (shape)").
- If the server answers 404 (polarization disabled, or an older backend) or 503 (worker down,
  timed out or busy), the chart says so; there is no client fallback.

The wiki's *Polarization measures* section documents the measures (formulas, parameters, levels,
references) from `src/features/run-polarization/lib/measure-docs.ts`: the wiki is public, so it
cannot read the authenticated catalog. Variance and standard deviation over time are not part of
this feature: they stay when it is disabled.

**Disable it** on either side:

- frontend, at build time (on by default; only the exact value `false` turns it off):

  ```bash
  PUBLIC_ENABLE_POLARIZATION=false bun run build
  ```

  A disabled build computes no fine histograms, shows no Polarization tab, wiki section or user
  manual section, and the bundler drops the code (`__POLARIZATION__` is a build-time literal, like
  `__BENCHMARK__`). The default lives in `rsbuild.config.ts`, not in an `.env` file.
- backend: `APP_POLARIZATION=false` (default enabled, in code). Both endpoints then answer 404 and
  Python is never started; the chart shows "not available on this server".

**Remove it** from the frontend: delete `src/shared/lib/polarization/`, `src/features/run-polarization/`,
`src/shared/i18n/locales/polarization.en.ts` and `polarization.es.ts`, and the integration points,
each marked with the comment `polarization (#129)` (`grep -rn "polarization (#129)" src rsbuild.config.ts vitest.config.ts`):
the build flag (`rsbuild.config.ts`, `vitest.config.ts`, `src/shared/config/build-flags.d.ts`), the
per-round histogram hook (`src/shared/lib/round-stats.ts`, `src/shared/workers/simulation-frame.worker.ts`,
`src/entities/simulation/lib/round-aggregates.ts`, `src/entities/simulation/model/round-aggregates.store.ts`),
the run charts tab (`src/pages/live-run/run-view.tsx`), the wiki section (`src/pages/wiki/wiki-page.tsx`),
the user manual's section (`src/pages/docs/content/{en,es}/polarization.mdx`, its entries in
`src/pages/docs/model/sections.ts` and `content.ts`, and `PolarizationLineStyles` / `WithPolarization`
in `src/pages/docs/ui/doc-embeds.tsx`, `mdx-components.tsx` and `charts-and-data.mdx`)
and the `polarization` namespace merge in `src/shared/i18n/locales/en.ts` and `es.ts`. The API
methods `simulationsApi.getPolarizationMeasures` / `computePolarization` and their types
(`src/shared/api/backend`) follow the backend's OpenAPI.

**Bump pol_measures**: it is pinned in ONE place, `ARG POL_MEASURES_REF` at the top of the backend's
`Dockerfile` (see the backend README, "Polarization measures": build, run the worker self-test in
the image). The chart's info tooltip shows the commit the server reports. Then update
`POL_MEASURES_SOURCE.commit` (`src/shared/lib/polarization/source.ts`, the wiki's attribution and
link) and review `measure-docs.ts` (formulas, defaults, thresholds) against the new commit.

---

## User manual

The user manual is a public page of the landing shell, `/docs` (the index) and `/docs/<section>`,
linked from the top bar (**Manual**), the footer and the user menu (**User manual**). It is written
in MDX, one file per section and language, and follows the language chosen in the user menu.

| # | Section (`/docs/<id>`) | Covers |
| --- | --- | --- |
| 1 | `getting-started` | What SiLEnSeSS is, signing in, roles and quotas, getting around |
| 2 | `new-simulation` | The wizard: generated / custom networks, agents, review, seed, files, quotas |
| 3 | `my-experiments` | The history: filters, details, re-launch, export, cancel, statuses |
| 4 | `run-view` | The graph, the inspector, the timeline, live vs. replay, multi-network runs |
| 5 | `charts-and-data` | Every chart and the data table, with its CSV export |
| 6 | `polarization` | The Polarization tab: settings, levels, comparison, table and CSV (only when the build has it) |
| 7 | `profile` | Account details, display name, usage limits, deactivation |

Where things live (`src/pages/docs/`):

- `model/sections.ts`: the registry (ids, order, title and summary per language); the sidebar,
  the index and the previous / next links come from it. `model/content.ts` loads each section's
  MDX as its **own lazy chunk** (`docs-<lang>-<id>`), so opening a section downloads only that
  file in the language being read; the page itself is the `page-docs` chunk, and its strings
  (`src/shared/i18n/locales/docs.{en,es}.ts`) are registered at runtime, outside the initial chunk.
- `content/{es,en}/<id>.mdx`: the text. Headings (`##`, `###`) get their slug as id
  (`src/shared/lib/slugify.ts`, accents dropped) and feed the "On this page" list.
- `ui/mdx-components.tsx`: what an MDX file can use without imports. Markdown (headings,
  paragraphs, lists, links, `code`, bold) plus `<Tip>`, `<Warning>`, `<Kbd>`, `<Screenshot>`,
  `<Ui>` (a UI label quoted in the text), `<UiPreview>` / `<UiButton k="i18n.key">` (real buttons,
  non-interactive) and live embeds of the real interface (`<RoleQuotasTable>` from `ROLE_LIMITS`,
  `<RunStatusBadges>`, `<CanvasLegendPreview>`, `<TimelineEventLegend>`,
  `<PolarizationLineStyles>`). Tables need no GFM plugin: use lists or an embed.

Rules, enforced by `content/content.test.ts`:

- Every section has both files, with the same headings structure, components and screenshot
  slots in English and Spanish.
- Every `<Ui>…</Ui>` is a **real label of that language**: a value of `en.ts` / `es.ts` (or the
  polarization strings), where a `{{placeholder}}` stands for any value (`<Ui>Round 12</Ui>`).
  Renaming a label in the UI therefore fails the test until the manual is updated.
- Links to `/docs/<id>#anchor` must hit an existing section and heading of the same language;
  other in-app links must be app routes.

**Add a section**: an id in `DOC_SECTION_IDS` and its entry in `SECTIONS` (`model/sections.ts`),
its loader in `model/content.ts`, and `content/en/<id>.mdx` + `content/es/<id>.mdx`.

### Screenshots

`<Screenshot name="<slot>" alt="…">` shows `public/docs/<lang>/<theme>/<slot>.webp`: the
language being read and the current theme (`light` / `dark`), so each slot has **four files**.
Until a file exists, the page shows a dashed "Screenshot pending" frame with what the capture must
show (the `alt`) and the path it expects; switching language or theme tries the new file. Capture
the real interface in that language and theme, 16:9 (e.g. 1600×900), as WebP.

| Section | Slots |
| --- | --- |
| getting-started | `login`, `dashboard-overview`, `user-menu` |
| new-simulation | `wizard-network-generated`, `wizard-agents-generated`, `wizard-custom-agents`, `wizard-review`, `wizard-load` |
| my-experiments | `experiments-list`, `experiment-details` |
| run-view | `run-view-overview`, `run-view-graph`, `run-view-timeline`, `run-view-networks` |
| charts-and-data | `charts-evolution`, `charts-variance`, `data-table` |
| polarization | `polarization-chart`, `polarization-compare`, `polarization-table` |
| profile | `profile-sheet` |

21 slots, 84 files (`public/docs/{en,es}/{light,dark}/<slot>.webp`). Slot names are lower-case
words joined by dashes, each used once in the manual.

---

## Versioning

Follows Semantic Versioning with pre-release tags:

```
2.0.0-alpha.X    ← Active development (current)
2.0.0-beta.X     ← Feature complete
2.0.0-rc.X       ← Release candidate
2.0.0            ← Stable release
```

---

## Roadmap

- [x] Rsbuild + React + TypeScript base setup
- [x] FSD architecture
- [x] Biome configuration
- [x] Vitest setup
- [x] Tailwind CSS v4
- [x] shadcn/ui integration
- [ ] Theme provider (dark mode toggle)
- [ ] Auth feature (login, protected routes)
- [ ] API client with Axios
- [ ] Zustand stores
- [ ] Feature: cosmograph (network visualization)
- [ ] Feature: users management
- [ ] Landing page
- [ ] Board/simulation pages
- [ ] Wiki page (theory documentation)

---

## Contributing

1. Follow the FSD import rules strictly
2. Run `bun run check` before committing
3. Write tests for business logic in `features/` and `entities/`
4. Use `shadcn/ui` components from `@/shared/ui/` — don't create parallel UI primitives
5. Keep components typed — avoid `any`

---

## License

*TBD*