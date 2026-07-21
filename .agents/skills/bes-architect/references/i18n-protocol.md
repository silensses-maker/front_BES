# i18n Protocol

Internationalization is **not optional** in `front_BES`. Every user-visible string must ship with its translation entries in the same change.

## Setup (already in place)

- Library: `i18next` + `react-i18next` + `i18next-browser-languagedetector`
- Init: `src/shared/i18n/config.ts`
- Provider: `<I18nextProvider>` mounted in `src/app/providers.tsx`
- Locale files: `src/shared/i18n/locales/{en,es}.ts` (TypeScript, not JSON — enables type inference)
- Re-exports: `src/shared/i18n/index.ts` exposes the instance, `useTranslation`, and `Trans`

## Existing namespaces

```ts
common:  { save, saving, loading, unlimited, cancel }
auth:    { loginPage, welcome, signInGoogle, continueWithout, signingIn, signOut }
profile: { title, accountInfo, email, role, usageLimits, maxAgents, maxIterations,
           densityFactor, editDisplayName, displayName, namePlaceholder,
           dangerZone, deactivateAccount, deactivateConfirm, deactivating }
home:    { name, email, roles, maxAgents, maxIterations, densityFactor }
nav:     { language, en, es }
```

Keys are flat per namespace, not nested.

## Hard rules

1. **No hardcoded user-visible strings.** Every label, button text, heading, placeholder, error message, toast, tooltip, and confirmation dialog must use `t('namespace.key')`. Zero exceptions.
2. **Always import from `@/shared/i18n`.** Never from `react-i18next` directly. The re-export keeps the import path consistent and refactorable.
3. **Both locales stay in sync.** Any new key must be added to **both** `en.ts` and `es.ts` in the same change. A key in only one file is incomplete i18n.
4. **No empty Spanish strings.** If you don't have the translation, ask the user for it before adding a placeholder.
5. **One namespace per feature.** Use existing namespaces (`common`, `auth`, `profile`, `home`, `nav`) when the key fits. For a new feature, define a new namespace (e.g., `simulation`, `experiment`, `dashboard`) and add it to both locale files simultaneously.
6. **Toast messages count as copy.** `toast.error("Failed to save")` is a violation. It must be `toast.error(t('namespace.errorSave'))`.

## Standard usage

```tsx
import { useTranslation } from '@/shared/i18n'

export function MyComponent() {
  const { t } = useTranslation()
  return <button>{t('auth.signInGoogle')}</button>
}
```

## When proposing new UI

Any guidance for a new component or page must include:

1. The `t('namespace.key')` calls inline in the component code.
2. The exact list of keys to add to `shared/i18n/locales/en.ts` and `es.ts`.
3. The namespace to use (existing or new). If new, state explicitly that both locale files must register the new namespace key.

A proposal that omits this is incomplete and should not be considered ready to implement.

## Language switcher

The language switcher lives at `features/language-switch/` because changing the language is a user action with a side effect (mutates i18next state + writes to localStorage). Side-effect actions belong in `features/`, not `shared/`. To use it on a page:

```tsx
import { LanguageSwitcher } from '@/features/language-switch'
```
