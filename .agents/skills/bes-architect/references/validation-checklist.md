# Validation Checklist

When reviewing existing code in `front_BES`, walk this checklist in order of severity. Be explicit about what is wrong and why.

## Critical (breaks the architecture)

- [ ] Import from a higher layer (e.g., `entities` importing from `features`).
- [ ] Feature importing from another feature (cross-feature import).
- [ ] Deep import bypassing `index.ts` (e.g., `@/entities/user/model/user.store` instead of `@/entities/user`).
- [ ] User actions with side effects (login, logout, submit) living in entity stores. Entity stores own state and passive subscriptions only; actions belong in `features/`.

## Structural (misplaced code)

- [ ] User actions / side effects in entity stores. Login, logout, submit, etc. belong in `features`, not `entities`. Entity stores should own state and derived data only.
- [ ] Layout components placement. **Do not suggest moving a layout to `shared/ui/` preemptively.** Per `guides/page-layout.mdx`:
  - Layout used by ONE feature only → keep inside that feature, even if it has no feature-specific logic.
  - Layout shared across multiple features/pages AND containing no widget imports → `shared/ui/`.
  - Layout that uses widgets → CANNOT go in `shared/ui/`; use `app/layouts/` instead.
- [ ] Hooks with side effects (API calls, toasts, navigation) in `lib/`. `lib/` is for pure functions and simple hooks without side effects; hooks with side effects go in `model/`.
- [ ] Business logic in `pages/`. Pages should compose, not implement.
- [ ] UI components in `model/` or `api/` segments.

## Missing

- [ ] Slice without `index.ts` public API.
- [ ] `index.ts` that exports internal paths instead of re-exporting the public interface.
- [ ] `app/` layer missing providers (i18n, theme, toast) — these shouldn't be scattered in `main.tsx`.

## i18n violations

(Detailed protocol in `i18n-protocol.md`. Flag any of:)

- [ ] Hardcoded user-visible string in a component — every label, button text, heading, placeholder, error message, toast, and confirmation dialog must use `t('namespace.key')`. No exceptions.
- [ ] `useTranslation` imported directly from `react-i18next` — must come from `@/shared/i18n`.
- [ ] New translation key used in a component but not added to **both** `shared/i18n/locales/en.ts` and `shared/i18n/locales/es.ts`.
- [ ] Translation key with a missing or empty Spanish string — incomplete i18n.
- [ ] Namespace mismatch — keys must follow the existing convention (`common`, `auth`, `profile`, `home`, `nav`). New features get a new namespace registered in both locale files at the same time.

## Error handling violations

(Detailed pattern in `error-handling-pattern.md`. Flag any of:)

- [ ] Async feature hook missing `try/catch` + `logger.error(context, e)` + `toast.error(...)` + `finally { setLoading(false) }`.
- [ ] `toast.error` with a hardcoded string instead of `t(...)`.
- [ ] `logger.error` missing the context string (the hook name).

## Config file review

When the user brings `vitest.config`, `tsconfig`, `rsbuild.config`, `biome.json`, etc.:

- [ ] Required packages are actually installed in `package.json` `devDependencies`. For example, `coverage: { provider: 'v8' }` requires `@vitest/coverage-v8`; `@testing-library/jest-dom` in `setupFiles` requires the package. Don't assume installation just because the config references it.
