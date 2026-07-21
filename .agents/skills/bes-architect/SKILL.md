---
name: bes-architect
description: Reference knowledge base for the front_BES project (React frontend for opinion-dynamics simulation, PROMUEVA group, Univalle). Provides Feature-Sliced Design rules, project structure, technology placement maps, naming conventions, the i18n protocol, the error-handling pattern, and a validation checklist. Use when deciding where a new feature, file, or technology should live; when adding i18n, WebSockets, Cosmograph, REST API, tests, or any other technology to the codebase; when reviewing code against project conventions; or when implementing any issue from the project milestones.
---

# BES Architect Reference

Knowledge base for the `front_BES` project. This file is an index — load only the references relevant to the current task.

## When to read what

| Task | Reference |
|---|---|
| FSD layer rules, layout placement, auth patterns, API segment, types, sub-slice grouping | [references/fsd-official-rules.md](references/fsd-official-rules.md) |
| Where a specific technology goes (i18n, WebSockets, REST, Cosmograph, charts, tests, SonarCloud, profile, experiments, dashboards, agent inspection) | [references/tech-placement.md](references/tech-placement.md) |
| Current `src/` tree, stack, segment usage, layer roles, cross-layer import cheatsheet, known issues | [references/project-structure.md](references/project-structure.md) |
| Hard rules for translations, locale sync, namespaces, toast copy | [references/i18n-protocol.md](references/i18n-protocol.md) |
| Mandatory `try/catch` + `logger.error` + `toast.error` + `finally` pattern for async feature hooks | [references/error-handling-pattern.md](references/error-handling-pattern.md) |
| File, component, store, hook, and slice naming | [references/naming-conventions.md](references/naming-conventions.md) |
| Reviewing existing code (critical / structural / missing / i18n / error-handling / config violations) | [references/validation-checklist.md](references/validation-checklist.md) |

## External sources

- Official FSD docs (in this project): `.context/FSD/` — `overview.mdx`, `tutorial.mdx`, `guides/auth.mdx`, `guides/page-layout.mdx`, `guides/api-requests.mdx`, `guides/types.mdx`. Authoritative source when references conflict.
- FSD upstream: https://feature-sliced.design/docs
- Project design system (colors, typography, motion, dark mode, shadcn-specific rules): `.context/design-system.md`
- Project milestones and issues: `.context/milestones.json`, `.context/issues/issues.json`

## Two unbreakable rules

1. **Imports flow downward only.** `shared` knows nothing above it. `entities` imports from `shared` only. `features` from `entities` + `shared`. `pages` from everything below. `app` from everything. Slices on the same layer cannot import each other.

2. **No deep imports.** Every slice exposes a public API through its `index.ts`. Consumers import from the slice root, never from internal paths.

```ts
// ✅ correct
import { useAuthStore } from '@/entities/user'
import { LoginButton } from '@/features/auth/login'

// ❌ wrong — breaks encapsulation
import { useAuthStore } from '@/entities/user/model/user.store'
```

## Delegation to other skills

- **Deep shadcn questions** (component API, registry search, updating a component, theming internals, form composition rules) → invoke the `shadcn` skill. This skill decides *where* a component goes in FSD; `shadcn` decides *how* it is built.
- **Visual / motion / typography / palette decisions** → read `.context/design-system.md` first. The `frontend-design` skill is for inspiration on net-new aesthetics, not for overriding project conventions.
