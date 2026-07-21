# Technology Placement Reference

Detailed guide for placing each technology from the project milestones into the FSD architecture.

---

## i18n — Multi-language Support (Issue #35, Milestone 1) ✅ IMPLEMENTED

**Libraries:** `i18next` + `react-i18next` + `i18next-browser-languagedetector`

**Why shared?** Language resources and the i18n instance are framework-agnostic infrastructure — like Firebase config. Any slice can use translations without knowing where the files live.

**Actual implementation:**
```
src/
├── shared/
│   └── i18n/
│       ├── config.ts          ← i18next init: LanguageDetector (localStorage → navigator) + fallback "en"
│       ├── locales/
│       │   ├── en.ts          ← English translations (TypeScript, not JSON — enables type inference)
│       │   └── es.ts          ← Spanish translations
│       └── index.ts           ← re-exports: i18n instance, useTranslation, Trans
├── app/
│   └── providers.tsx          ← AppProviders: <I18nextProvider> + <Toaster>
├── features/
│   └── language-switch/
│       ├── model/use-language-switch.ts  ← hook: reads currentLang, calls i18n.changeLanguage()
│       ├── ui/language-switcher.tsx      ← <select> UI component
│       └── index.ts
```

**Why `features/language-switch/` and not `shared/ui/`?**  
Changing the language is a user action with a side effect (mutates i18next state + writes to localStorage). Side-effect actions belong in `features/`, not `shared/`. The `<select>` UI element itself is thin and tied to the hook, so it lives alongside it in `features/language-switch/ui/`.

**Usage in any slice (always import from `@/shared/i18n`, never from `react-i18next` directly):**
```ts
import { useTranslation } from '@/shared/i18n'

const { t } = useTranslation()
t('auth.signInGoogle') // → "Sign in with Google" | "Iniciar sesión con Google"
```

**Adding the language switcher to a page:**
```tsx
import { LanguageSwitcher } from '@/features/language-switch'

// place in page header or top-right corner
<LanguageSwitcher />
```

**Existing namespaces (flat keys, not nested):**
```ts
// shared/i18n/locales/en.ts
{
  common:  { save, saving, loading, unlimited, cancel }
  auth:    { loginPage, welcome, signInGoogle, continueWithout, signingIn, signOut }
  profile: { title, accountInfo, email, role, usageLimits, maxAgents, maxIterations,
             densityFactor, editDisplayName, displayName, namePlaceholder,
             dangerZone, deactivateAccount, deactivateConfirm, deactivating }
  home:    { name, email, roles, maxAgents, maxIterations, densityFactor }
  nav:     { language, en, es }
}
```

**Adding keys for a new feature:** add to both `en.ts` and `es.ts` simultaneously, under a new namespace matching the feature name (e.g., `simulation`, `experiment`, `dashboard`).

---

## WebSockets — Real-Time Data Streaming (Issue #42, Milestone 3)

**Why entities?** The WebSocket connection is tied to the `simulation` entity — it receives agent state updates and feeds the Zustand store directly.

```
src/entities/simulation/
├── api/
│   └── simulation.ws.ts       ← WebSocket client: connect, disconnect, heartbeat, reconnect
├── model/
│   └── simulation.store.ts    ← Zustand store: receives WS payloads, exposes state to features
├── types/
│   └── simulation.types.ts    ← WsMessage, AgentState, SimulationStatus types
└── index.ts
```

**Data flow:**
```
WS Server → simulation.ws.ts → useSimulationStore → widgets/simulation-graph
```

The WS client should never touch React — it's a plain TypeScript class/module that dispatches to the store. This keeps it testable without a DOM.

**Hybrid Bridge (Issue #43):**
```
src/shared/api/http/
├── client.ts                  ← base axios/fetch wrapper with interceptors
└── index.ts

src/entities/simulation/api/
├── simulation.ws.ts           ← real-time path
└── simulation.api.ts          ← REST fallback path (uses shared/api/http)
```

The feature layer (`features/simulation-control/`) decides which to use based on connection state.

---

## REST API Client (Issue #43, Milestone 3)

```
src/shared/api/http/
├── client.ts        ← base fetch/axios instance (base URL, headers, error handling)
├── types.ts         ← ApiResponse<T>, PaginatedResponse<T>
└── index.ts
```

Entity-specific calls live in each entity:
```
entities/experiment/api/experiment.api.ts   ← uses shared/api/http/client
entities/user/api/user.api.ts              ← already exists, can migrate to http client
```

**Rule:** `shared/api/http` knows nothing about the domain. Entities own the domain-specific endpoints.

---

## Cosmograph — GPU-Accelerated Rendering (Issue #47, Milestone 4)

Cosmograph is a heavy WebGL library. Split it into two concerns:

**1. Library configuration → shared/lib**
```
src/shared/lib/cosmograph/
├── config.ts          ← default Cosmograph config (colors, shaders, LOD thresholds)
├── types.ts           ← CosmographNode, CosmographLink mapped from SimulationAgent
└── index.ts
```

**2. The actual graph component → widgets**
```
src/widgets/simulation-graph/
├── ui/
│   ├── simulation-graph.tsx    ← main Cosmograph wrapper component
│   ├── node-legend.tsx         ← dynamic color legend
│   └── graph-controls.tsx      ← zoom, pan, reset buttons
├── model/
│   └── use-graph-state.ts      ← selects from useSimulationStore, maps to Cosmograph format
└── index.ts
```

**Why widgets?** The graph appears in the live simulation page AND potentially in the experiment history view. Widgets are for exactly this: complex UI blocks reused across pages.

**Why not features?** Cosmograph doesn't represent a user action — it's a display block. Features are for things the user *does* (run simulation, export, configure).

**Node styling (Issue #48):** The color-mapping logic lives in `shared/lib/cosmograph/config.ts` as a pure function `opinionToColor(value: number): string`. The widget consumes it.

---

## Vitest Tests (Issue #39, Milestone 2)

**Co-location rule:** tests live next to the code they test, inside the same segment.

```
entities/user/model/
├── user.store.ts
└── user.store.test.ts      ← Zustand store tests

shared/lib/
├── utils.ts
└── utils.test.ts

features/auth/login/model/
├── use-login.ts
└── use-login.test.ts
```

**For UI components:**
```
features/auth/login/ui/
├── login-button.tsx
└── login-button.test.tsx   ← React Testing Library + happy-dom
```

**Setup file** — already created:
```
src/test/setup.ts           ← contains: import "@testing-library/jest-dom"
```
It is referenced in `vitest.config.ts` as `setupFiles: ["./src/test/setup.ts"]`.

**Path aliases in tests** — already configured in vitest.config.ts via `@/` → `src/`. No extra setup needed.

---

## SonarCloud (Issue #38, Milestone 2)

SonarCloud is a DevOps tool — it has zero impact on `src/` structure.

**Files to create at root:**
```
sonar-project.properties    ← project key, org, sources=src, tests pattern
.github/workflows/sonar.yml ← runs on PR, sends analysis to SonarCloud
```

The only `src/` consideration: SonarCloud reads coverage from Vitest's `coverage/lcov.info` output. Make sure vitest.config.ts outputs lcov format:
```ts
coverage: { reporter: ['text', 'lcov'] }
```

---

## Automated Versioning (Issue #41, Milestone 2)

```
.github/workflows/release.yml   ← triggers on push to main
                                   runs: bunx standard-version or semantic-release
CHANGELOG.md                    ← auto-generated from conventional commits
```

No `src/` involvement. Commit message format matters: `feat:`, `fix:`, `chore:`, `docs:`.

---

## User Profile Page (Issue #36, Milestone 1)

```
src/pages/profile/
└── profile-page.tsx            ← thin page, composes features

src/features/profile/
├── edit-display-name/
│   ├── model/use-edit-name.ts
│   ├── ui/edit-name-form.tsx
│   └── index.ts
├── deactivate-account/
│   ├── model/use-deactivate.ts
│   ├── ui/deactivate-button.tsx
│   └── index.ts
└── index.ts
```

Usage limit display comes from `entities/user` (`usePermissions` hook lives at `entities/user/model/use-permissions.ts` — in `model/` because it reads from `useAuthStore`).

---

## Experiment Management (Issues #44–#46, Milestone 3)

A new entity is needed:

```
src/entities/experiment/
├── api/experiment.api.ts       ← Firestore CRUD for experiment docs
├── model/experiment.store.ts   ← Zustand: current experiment state
├── types/experiment.types.ts   ← Experiment, ExperimentStatus, SimParams types
└── index.ts

src/features/experiment/
├── create/                     ← simulation setup wizard (Issue #44)
├── export/                     ← JSON/CSV export (Issue #45)
└── index.ts

src/pages/dashboard/
└── dashboard-page.tsx          ← experiment list + search/filter (Issue #46)

src/widgets/experiment-list/    ← reusable list UI if needed across pages
```

---

## Analytical Dashboard / Charts (Issue #49, Milestone 4)

```
src/widgets/analytics-dashboard/
├── ui/
│   ├── analytics-dashboard.tsx    ← container, toggleable visibility
│   ├── opinion-histogram.tsx      ← Recharts BarChart
│   └── opinion-timeline.tsx       ← Recharts LineChart
├── model/
│   └── use-analytics-data.ts      ← selects from useSimulationStore, formats for charts
└── index.ts
```

Charts are synchronized to simulation via `useSimulationStore` — no direct WS dependency in the widget.

---

## Interactive Agent Inspection (Issue #51, Milestone 4)

```
src/features/agent-inspection/
├── model/
│   └── use-agent-selection.ts     ← raycasting result → selected agent ID → store
├── ui/
│   ├── agent-detail-sidebar.tsx   ← DeGroot weights, threshold, opinion value
│   └── ego-network-highlight.ts   ← passes highlight config to Cosmograph widget
└── index.ts
```

The selected agent's data comes from `entities/simulation` store. The feature reads it and formats it for display.
