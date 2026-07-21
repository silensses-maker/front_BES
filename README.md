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

### Vitest

- Environment: happy-dom (3-5x faster than jsdom)
- Globals enabled (no need to import `describe`, `it`, `expect`)
- Coverage thresholds: 80% across statements, branches, functions, and lines

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