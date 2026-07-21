#!/usr/bin/env bash
# scan.sh — Detect modified testable files in the front_BES FSD structure.
#
# Usage:
#   bash scripts/scan.sh              # uncommitted changes vs HEAD
#   bash scripts/scan.sh --branch     # branch changes vs main
#   bash scripts/scan.sh -b           # same as --branch
#
# Output: one file path per line — only files that:
#   1. Live in a testable FSD segment (model/, lib/, api/)
#   2. Are .ts or .tsx files
#   3. Are NOT test files, index barrels, type definitions, or .d.ts

set -euo pipefail

MODE="local"
for arg in "$@"; do
  case "$arg" in
    --branch|-b) MODE="branch" ;;
    *) echo "Unknown flag: $arg" >&2; exit 1 ;;
  esac
done

# ── Collect changed file paths ──────────────────────────────────────────────

if [ "$MODE" = "branch" ]; then
  BASE_BRANCH="${BASE_BRANCH:-main}"
  MERGE_BASE=$(git merge-base "$BASE_BRANCH" HEAD 2>/dev/null || echo "$BASE_BRANCH")
  FILES=$(git diff --name-only --diff-filter=ACMR "$MERGE_BASE"..HEAD 2>/dev/null || true)
  # Also include uncommitted changes on top of branch work
  UNCOMMITTED=$(git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null || true)
  FILES=$(printf "%s\n%s" "$FILES" "$UNCOMMITTED" | sort -u)
else
  # Staged + unstaged vs HEAD
  FILES=$(git diff --name-only --diff-filter=ACMR HEAD 2>/dev/null || true)
  # Include untracked new files
  UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)
  FILES=$(printf "%s\n%s" "$FILES" "$UNTRACKED" | sort -u)
fi

# ── Filter for testable FSD paths ───────────────────────────────────────────
# Allowed segments: entities/*/model|lib|api, features/**/model|lib|api, shared/lib|api

filter_fsd() {
  grep -E '^src/((entities|features)/.*/(model|lib|api)|shared/(lib|api))/.*\.(ts|tsx)$' 2>/dev/null || true
}

# ── Exclude non-testable files ──────────────────────────────────────────────
# test files, spec files, index barrels, type declarations, types directories

exclude_noise() {
  grep -v -E '\.(test|spec)\.(ts|tsx)$' \
  | grep -v -E '(^|/)index\.ts$' \
  | grep -v -E '\.d\.ts$' \
  | grep -v -E '(^|/)types/' \
  || true
}

echo "$FILES" | filter_fsd | exclude_noise | sort -u
