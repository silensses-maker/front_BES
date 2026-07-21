# Project Structure Snapshot

Current `src/` tree of `front_BES`. Update this file when slices are added or moved.

## Stack

- Build: Bun + Rsbuild + Rspack
- UI: React 19 + TypeScript (strict) + Tailwind CSS v4 + Radix UI / Shadcn
- Routing: React Router DOM v7
- State: Zustand
- Backend: Firebase (Auth + Firestore) + firebase-admin (scripts only)
- Quality: Biome (lint + format) + Vitest + happy-dom
- Motion: `motion` (motion/react v12) for page-load orchestration + `tw-animate-css` for hover/transition states
- i18n: `i18next` + `react-i18next` + `i18next-browser-languagedetector`
- Path alias: `@/` → `src/`

## Tree

```
src/
├── app/
│   ├── providers.tsx                ← AppProviders: I18nextProvider + Toaster
│   └── routes.tsx
├── pages/
│   ├── login/login-page.tsx
│   ├── home/home-page.tsx
│   ├── profile/profile-page.tsx
│   └── index.ts
├── widgets/                         ← (not yet used — see notes below)
├── features/
│   ├── auth/
│   │   ├── login/  (model/use-login.ts + ui/ + index.ts)
│   │   ├── logout/ (model/use-logout.ts + ui/ + index.ts)
│   │   ├── protected-route.tsx      ← ⚠ outside a segment subfolder (see Known Issues)
│   │   └── index.ts
│   ├── profile/
│   │   ├── edit-display-name/ (model/use-edit-name.ts + ui/ + index.ts)
│   │   ├── deactivate-account/ (model/use-deactivate.ts + ui/ + index.ts)
│   │   └── index.ts
│   └── language-switch/
│       ├── model/use-language-switch.ts
│       ├── ui/language-switcher.tsx
│       └── index.ts
├── entities/
│   └── user/
│       ├── api/user.api.ts
│       ├── lib/permissions.ts
│       ├── model/
│       │   ├── use-permissions.ts   ← hook with side effects, correctly in model/
│       │   └── user.store.ts
│       ├── types/user.types.ts
│       └── index.ts
├── shared/
│   ├── api/
│   │   ├── firebase/ (auth.ts, config.ts, env.d.ts, firestore.ts, index.ts)
│   │   └── types/firebase.types.ts
│   ├── assets/logos/
│   ├── i18n/
│   │   ├── config.ts                ← i18next init with LanguageDetector
│   │   ├── locales/
│   │   │   ├── en.ts                ← English (namespaces: common, auth, profile, home, nav)
│   │   │   └── es.ts                ← Spanish
│   │   └── index.ts                 ← re-exports i18n instance + useTranslation + Trans
│   ├── lib/ (logger.ts, utils.ts)
│   ├── styles/globals.css
│   ├── ui/ (button.tsx, constellation.tsx, logo.tsx, sonner.tsx)
│   └── index.ts
├── scripts/migrate-usage-limits.ts  ← outside FSD, one-off admin scripts
├── test/setup.ts                    ← Vitest global setup
└── main.tsx
```

## Sub-slice grouping note

Sub-slice grouping (e.g., `features/auth/login/`, `features/auth/logout/`) is a pragmatic deviation from canonical FSD. It is acceptable when each sub-group has its own `index.ts` and they don't import from each other, but it should be acknowledged as a deviation when reviewing — not called "valid FSD".

## Segments used inside slices

- `ui/` — React components
- `model/` — Zustand stores, hooks with side effects
- `api/` — data fetching, Firebase/HTTP/WS calls
- `lib/` — pure functions, hooks without side effects
- `types/` — TypeScript types and interfaces
- `config/` — constants, configuration objects

## When to use each layer

- **shared** — "I don't know which feature will use this." HTTP client base, Firebase init, i18n config, design tokens, `cn()`, toast provider, reusable UI primitives.
- **entities** — "This is a business object that multiple features need." `user`, `simulation`, `experiment`, `agent`. Each entity owns its Zustand store, API calls, and types.
- **features** — "This is something the user *does*." `auth/login`, `simulation-control/run`, `experiment/create`. The only layer that combines entity data with user intent.
- **widgets** — "This is a complex UI block reused across pages." `simulation-graph`, `analytics-dashboard`, `experiment-list`. Not yet used; introduce when M3/M4 brings simulation visualization and dashboards.
- **pages** — "This is a route." Thin compositions, not implementations.
- **app** — "This runs once at startup." Router, global providers, Firebase initialization check.

## Cross-layer import cheatsheet

```
pages/dashboard     → can import from widgets/, features/, entities/, shared/
features/simulation → can import from entities/simulation, entities/user, shared/
entities/simulation → can import from shared/ ONLY
shared/i18n         → can import from nothing (zero dependencies)
```

If something wants to import from a higher layer, the logic belongs somewhere else — extract to `shared/lib/` (if generic) or lift to a `feature/`.

## Known issues to watch for

- `features/auth/protected-route.tsx` sits at the feature root instead of `features/auth/ui/` — it lacks a segment subfolder, which breaks segment convention; move to `ui/` when touching auth.
- `widgets/` layer is empty — introduce it when the simulation graph and dashboards arrive (M3/M4).
