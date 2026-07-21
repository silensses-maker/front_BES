---
name: scanning-changes
description: Detects modified TypeScript source files that need unit tests by scanning git changes within testable FSD layers. Use this skill whenever the testing agent needs to know which files changed, when scanning for missing test coverage, when preparing to generate test scaffolds, or when checking what code was touched in the current branch or working directory. Triggers on any mention of "changed files", "modified code", "what needs testing", "scan for changes", or "untested files".
---

# Scanning Changes

Detect which source files have been modified and may need unit tests. This is the first step in the testing agent's workflow — it produces the list of files that downstream skills (`identifying-tests`, `generating-tests`) will act on.

## How it works

The skill bundles a deterministic bash script that handles all the git plumbing and FSD filtering. Run the script — don't reimplement the logic.

### Two scan modes

| Mode | Flag | What it compares | Use case |
|------|------|-----------------|----------|
| **Local** | _(default)_ | Uncommitted changes (staged + unstaged + untracked) vs HEAD | After editing files, before committing |
| **Branch** | `--branch` or `-b` | All commits on the current branch vs `main` + uncommitted | Before opening a PR, full branch review |

### Running the scan

Execute from the project root:

```bash
bash .agents/skills/scanning-changes/scripts/scan.sh           # local mode
bash .agents/skills/scanning-changes/scripts/scan.sh --branch   # branch mode
```

The script outputs one file path per line. Only files that pass all of these filters appear:

1. **FSD layer**: lives in `entities/*/model|lib|api/`, `features/**/model|lib|api/`, or `shared/lib|api/`
2. **File type**: `.ts` or `.tsx`
3. **Not noise**: excludes `*.test.ts`, `*.spec.tsx`, `index.ts` barrels, `*.d.ts` declarations, and anything under `types/` directories

If no files match, the output is empty — that means there's nothing to test.

### Interpreting the output

Each line is a path relative to the project root, for example:

```
src/entities/user/api/user.api.ts
src/features/auth/login/model/use-login.ts
src/shared/lib/logger.ts
```

These paths are ready to pass directly to `read_source_file` or `check_test_exists` operations. The FSD segment (the directory between the slice name and the filename) tells you what kind of code it is:

- `model/` — Zustand stores or React hooks with side effects
- `lib/` — Pure utility functions
- `api/` — Data-fetching or external service integrations

This segment matters because it determines the testing strategy — but that's the job of the `identifying-tests` skill, not this one.

### Customizing the base branch

By default, branch mode compares against `main`. Override with the `BASE_BRANCH` environment variable:

```bash
BASE_BRANCH=develop bash .agents/skills/scanning-changes/scripts/scan.sh --branch
```

## What this skill does NOT do

- It does not read file contents — it only lists paths
- It does not check whether a test file already exists — that's a separate step
- It does not decide what tests to write — that's `identifying-tests`
- It does not generate test code — that's `generating-tests`

Keep the responsibilities clean. This skill answers one question: **"what changed?"**
