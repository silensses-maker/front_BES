# FSD Official Rules — Extracted from Project Documentation

Full official docs live at `.context/FSD/` in this project:
- `.context/FSD/overview.mdx` — fundamentals, layers, slices, segments
- `.context/FSD/tutorial.mdx` — real-world walkthrough (Conduit app)
- `.context/FSD/guides/auth.mdx` — authentication patterns
- `.context/FSD/guides/page-layout.mdx` — layout placement rules
- `.context/FSD/guides/api-requests.mdx` — API layer organization
- `.context/FSD/guides/types.mdx` — TypeScript types in FSD

When in doubt about a rule, use WebFetch or Read on these files as the authoritative source.

---

## Layers (top → bottom)

1. **app** — routing, entrypoints, global styles, providers
2. ~~processes~~ — deprecated
3. **pages** — full pages or large sections in nested routing
4. **widgets** — large self-contained chunks of functionality or UI
5. **features** — reused implementations of entire product features
6. **entities** — business entities (user, product, order…)
7. **shared** — reusable functionality **detached from project specifics**

Import rule: modules on a layer can only import from **strictly lower** layers. Slices cannot import from other slices on the **same** layer.

---

## Layout Placement — Correct Rules

From `guides/page-layout.mdx`:

- **Simple layout with no widgets** → `shared/ui` or `app/layouts`
- **Layout that uses widgets** → CANNOT go in `shared/ui` (widgets can't be imported from shared). Options:
  1. Write layout inline on the App layer (`app/layouts/`)
  2. Copy-paste the layout across pages (acceptable — layouts rarely change)
  3. Use render props / slots
  4. Move to `app/layouts`

**Key implication for this project:**
`AuthLayout` uses `ConstellationBackground` (a shared/ui component — OK) but if it ever needs to use a widget, it cannot stay in `shared/ui`. Currently it only uses `shared/ui` components, so `shared/ui/auth-layout.tsx` is technically valid — but only while it remains widget-free.

**The conservative and correct rule:**
- If a layout is used by only ONE feature → keep it inside that feature (`features/auth/login/ui/`)
- Only move to `shared/ui` when it needs to be reused by multiple features/pages AND it contains no widget imports
- Never suggest moving a layout to `shared/ui` preemptively if it's only used in one place

---

## Authentication Patterns — Correct Rules

From `guides/auth.mdx`:

**Getting credentials:**
- Dedicated login page → slice on Pages layer ✓
- Login dialog/modal → Widgets layer (for reusability)
- Client-side validation → Zod schemas in `model` segment

**Token/session storage options (all valid):**
1. In `shared/api` — module-level state, good for automatic refresh middleware
2. In `entities/user` model — reactive store (current approach in this project) ✓
3. NOT in pages/widgets — discouraged for app-wide auth state

**Logout:**
- Keep logout request alongside login function (in same feature or same shared/api module)
- Update token store when logged out
- Clear token store on refresh/logout failure

**Current project pattern is valid:**
- `useLogin` in `features/auth/login/model/` — correct
- `useLogout` in `features/auth/logout/model/` — correct
- `useAuthStore` in `entities/user/model/` holding user state — correct
- `observeAuthState` in entity store — correct (passive subscription, not a user action)

---

## API Requests — Correct Rules

From `guides/api-requests.mdx`:

- **Shared across slices** → `shared/api/` (HTTP client base, headers, serialization)
- **Single slice only** → that slice's `api` segment (e.g., `pages/login/api/login.ts` or `entities/user/api/user.api.ts`)
- OpenAPI generated code → `shared/api/openapi/`

**For this project:**
- `shared/api/firebase/` → correct placement (Firebase client is shared infrastructure)
- `entities/user/api/user.api.ts` → correct (only entities/user uses it)
- Future WebSocket client → `entities/simulation/api/simulation.ws.ts` → correct

---

## Types — Correct Rules

From `guides/types.mdx`:

- Utility types → `shared/lib`
- DTOs → keep with request functions (in `api` segment)
- Mappers → near DTO definitions
- Validation schemas (Zod) → colocate with code that uses them
  - API responses → `api` segment
  - User input → `ui` or `model` segment
- Component props → same file as component (don't extract unless shared)
- Avoid `shared/types/` folder (groups by what, not why)
- Cross-entity references → use `@x` notation or parametrize types

---

## Segments — Correct Usage

| Segment | Contains |
|---|---|
| `ui/` | React components, styles |
| `model/` | Zustand stores, hooks WITH side effects or that read/write stores |
| `api/` | Data fetching, HTTP/WS/Firebase calls |
| `lib/` | Pure functions, hooks WITHOUT side effects (no store reads) |
| `config/` | Constants, configuration objects |
| `types/` | TypeScript interfaces and types |

**Critical distinction for this project:**
A hook that reads from a Zustand store (`useAuthStore(state => state.user)`) has a dependency — it belongs in `model/`, not `lib/`. `lib/` is for truly pure functions and hooks.

---

## Slices vs Sub-slices

FSD does not define "sub-slices" as a first-class concept. The standard structure is:

```
features/
  auth/           ← this is the slice
    ui/           ← segment
    model/        ← segment
    api/          ← segment
    index.ts
```

However, grouping related actions under a feature umbrella is an accepted pragmatic pattern:

```
features/
  auth/
    login/        ← action group (not canonical FSD but widely accepted)
    logout/
    index.ts
```

This pattern is acceptable when:
- The sub-groups share a clear domain context (all are "auth" actions)
- Each sub-group has its own `index.ts`
- No sub-group imports from another sub-group

It is NOT acceptable to call this "pure FSD" — it is a pragmatic deviation. When reviewing, acknowledge the deviation and note the tradeoff rather than calling it "valid FSD".
