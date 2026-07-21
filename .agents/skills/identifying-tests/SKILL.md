---
name: identifying-tests
description: Analyzes a TypeScript source file and produces a structured test plan — which functions to test, what scenarios to cover, what mocks are needed. Use this skill after scanning for changed files, when deciding what unit tests to write, when planning test coverage for a module, or when asking "what should I test in this file?". Triggers on any mention of "what tests", "test plan", "what to cover", "identify tests", "test strategy", or "missing coverage".
---

# Identifying Tests

Given a source file's content and its FSD location, produce a test plan: which exports to test, what scenarios to cover, and what dependencies need mocking. This is the analytical step between scanning and generating — it decides **what** to test, not **how** to write the code.

## How to use this skill

1. Read the source file with the `Read` tool
2. Identify the FSD segment from the file path (`model/`, `lib/`, or `api/`)
3. Follow the matching strategy below
4. Output a structured test plan

## Strategy by FSD segment

The segment in the path tells you the testing approach. Each has a different ratio of mocking to pure assertion.

### `lib/` — Pure utilities

Files in `lib/` export pure functions with no side effects. They're the easiest to test.

**What to look for:**
- Every `export function` and every method on an exported object
- Input/output boundaries: empty inputs, null/undefined, edge-case values
- Conditional branches (if/else, ternary, switch)

**What to mock:** Usually nothing. If a lib function imports from another shared module, that dependency is likely also pure — test through it rather than mocking it.

**Test plan shape:**
```
- Function: functionName
  - returns X when given Y
  - returns Z when given empty input
  - handles edge case: [describe]
```

**Example from this project:** `permissions.ts` exports `getRoleLimits` and `getRolePermissions` — both are pure functions that map role arrays to objects. The test covers each role, priority ordering, empty arrays, and deduplication.

### `model/*.store.ts` — Zustand stores

Store files create Zustand stores with state and actions. Test the store directly via `getState()` and `setState()` — no rendering needed.

**What to look for:**
- Initial state values — verify defaults
- Each action/method on the store — call it and check resulting state
- Async actions — test success path, error path, and loading state transitions
- Side effects in actions — these need mocking (Firebase auth, API calls)

**What to mock:**
- External services the store calls (Firebase `onAuthStateChanged`, `signOut`, API modules)
- Use `vi.mock("module-path")` at the top of the test file
- Mock the store's dependencies, not the store itself

**Test plan shape:**
```
- Initial state: verify user is null, loading is true
- Action: setUser
  - sets user when called with a User object
  - clears user when called with null
- Action: observeAuthState
  - sets loading true on invocation
  - returns unsubscribe function
  - sets user from Firestore on sign-in
  - clears state on deactivated account
```

### `model/use-*.ts` — React hooks with side effects

Feature hooks wrap async operations (login, logout, profile updates) and follow the project's error-handling pattern: `try/catch` + `logger.error` + `toast.error` + `finally { setLoading(false) }`.

**What to look for:**
- The main async function the hook exposes (e.g., `login`, `logout`, `updateName`)
- Loading state management
- Error handling path — does it call `logger.error` and `toast.error`?
- Dependencies the hook pulls from stores (`useAuthStore`)

**What to mock:**
- Firebase modules (`firebase/auth`)
- Store hooks (`@/entities/user`)
- Toast (`sonner`) — if you want to verify error messages
- i18n (`@/shared/i18n`) — the `t` function
- Logger (`@/shared/lib/logger`)

**Test plan shape:**
```
- Hook: useLogin
  - Mocks needed: firebase/auth, @/entities/user, @/shared/i18n, sonner, logger
  - calls signInWithPopup on login()
  - logs error and shows toast on auth failure
  - exposes loading state from auth store
```

**Complexity note:** Some hooks are thin wrappers (like `useLogin` — 5 lines of logic). Others have more branching. Scale the test plan to the actual complexity — don't create 15 test cases for a 5-line hook.

### `api/` — Data-fetching modules

API files are objects with async CRUD methods that call Firebase/Firestore. Each method follows the `try/catch + logger.error + toast.error` pattern.

**What to look for:**
- Each exported method (e.g., `getById`, `create`, `update`, `remove`)
- Success path: does it return the right value/shape?
- Error path: does it catch, log, toast, and return a safe fallback (null/false)?
- Edge cases: existing record on create, missing record on get

**What to mock:**
- `firebase/firestore` — the Firestore SDK functions (`getDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `getDocs`, `query`, `where`, etc.)
- `@/shared/api/firebase` — the `db` instance
- `sonner` — toast calls
- `@/shared/i18n` — the `i18n.t` function
- `@/shared/lib/logger` — logger calls
- Any cross-entity imports (e.g., `getRoleLimits` from `../lib/permissions`)

**Test plan shape:**
```
- Method: getById
  - returns User when document exists
  - returns null when document does not exist
  - catches error, logs, toasts, returns null
- Method: create
  - creates document when user does not exist
  - returns false when user already exists
  - catches error on write failure
```

## Files to skip

Not everything that passes through the scanner needs a test. Use judgment:

- **Config files** (`firebase/config.ts`) — pure initialization with no testable logic. Skip unless they contain conditional branches.
- **Files with only re-exports** — barrel-like files that just `export { x } from './y'`. Skip.
- **Files where the entire body is a single external SDK call** — if the "logic" is just `initializeApp(config)`, there's nothing to assert beyond "it didn't throw".

When skipping a file, note it in the test plan with the reason, so the agent doesn't silently ignore it.

## Output format

Present the test plan as a structured list per file:

```
## Test Plan: src/entities/user/api/user.api.ts
Segment: api (Firestore CRUD)

Mocks needed:
- firebase/firestore (getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, collection, doc)
- @/shared/api/firebase (db)
- @/shared/lib/logger (logger)
- sonner (toast)
- @/shared/i18n (i18n)
- ../lib/permissions (getRoleLimits)

Test cases:
- getById: returns User when exists | returns null when missing | catches and logs on error
- getByEmail: returns User when found | returns null when empty | catches on error
- create: creates when no existing | returns false when duplicate | catches on error
- update: returns true on success | catches on error
- remove: returns true on success | catches on error

Skip: No
```
