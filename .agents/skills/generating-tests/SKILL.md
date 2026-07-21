---
name: generating-tests
description: Generates Vitest unit test files following the front_BES project's established patterns — vi.mock, describe/it, typed fixtures, Zustand getState/setState, section separators. Use this skill when writing test scaffolds, generating test code, creating .test.ts files, or after identifying what tests a file needs. Triggers on "generate tests", "write tests", "create test file", "test scaffold", or "scaffold tests for".
---

# Generating Tests

Write Vitest test files that match the exact style and conventions of the front_BES project. This skill produces code — the test plan from `identifying-tests` tells you what to cover, and this skill tells you how to write it.

## Before generating

1. Read the source file you're testing
2. Have a test plan (from `identifying-tests` or your own analysis)
3. Read the matching reference example below to calibrate your output style

## Reference examples

Pick the reference that matches the file type you're testing:

| File type | Reference | When to read |
|-----------|-----------|--------------|
| Zustand store (`model/*.store.ts`) | [references/example-store-test.md](references/example-store-test.md) | Testing stores with sync/async actions, Firebase mocks |
| Pure utility (`lib/*.ts`) | [references/example-util-test.md](references/example-util-test.md) | Testing functions with multiple roles, edge cases, deduplication |
| Simple utility (single function) | [references/example-simple-test.md](references/example-simple-test.md) | Testing a single pure function with basic assertions |

Read the relevant reference file before writing — it contains the full test file with inline commentary on the patterns.

## Project conventions

These conventions are non-negotiable. Every test file must follow them.

### File placement and naming

Place the test file next to its source file:
```
src/entities/user/api/user.api.ts
src/entities/user/api/user.api.test.ts    <-- here
```

Use `.test.ts` (not `.spec.ts`). Use `.test.tsx` only if the file under test exports JSX components.

### Imports

Import test utilities explicitly from vitest — the project has `globals: true` in vitest config but the existing tests import explicitly for clarity:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
```

Import the module under test with a relative path (not the `@/` alias) when it's in the same slice:

```typescript
// testing entities/user/lib/permissions.ts
import { getRoleLimits, getRolePermissions, ROLE_LIMITS } from "./permissions";
```

Use `@/` alias only for cross-layer imports:
```typescript
import { useAuthStore } from "@/entities/user";
```

### Section separators

Use comment dividers to organize the test file into sections. The project uses this exact format:

```typescript
// ─── Module mocks ────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────────────

// ─── Fixtures ────────────────────────────────────────────────────────────────

// ─── Tests ───────────────────────────────────────────────────────────────────
```

Not every test needs all sections. Simple tests (like `utils.test.ts`) skip them entirely — use separators when you have mocks + types + fixtures (3+ sections of setup).

### Mocking pattern

Use `vi.mock()` at the module level (not inside tests). Mock the entire module, returning only what the source file uses:

```typescript
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));
```

Use `vi.mocked()` to get typed access to mocked functions:

```typescript
vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
  // ...
});
```

### Zustand store testing

Test stores directly — no `renderHook`, no React rendering:

```typescript
// Reset state before each test
beforeEach(() => {
  useAuthStore.setState({ user: null, loading: true });
  vi.clearAllMocks();
});

// Call actions through getState()
useAuthStore.getState().setUser(mockUser);

// Assert state through getState()
expect(useAuthStore.getState().user).toEqual(mockUser);
```

### Fixture typing

Type your mock objects explicitly — don't use `as any`:

```typescript
type MockFirebaseUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

const mockUser: User = {
  uid: "uid-researcher",
  email: "researcher@univalle.edu.co",
  name: "Researcher",
  photo: "",
  roles: ["Researcher"],
};
```

### Test structure

Use nested `describe` blocks to group by function or behavior area:

```typescript
describe("useAuthStore", () => {
  describe("initial state", () => { /* ... */ });
  describe("setUser", () => { /* ... */ });
  describe("observeAuthState", () => { /* ... */ });
});
```

Use `it` (not `test`). Write descriptions that read as complete sentences:
- "returns Administrator limits when Administrator is present"
- "sets user null and loading false when no firebase user is signed in"

### Async testing

Use `async/await` directly in `it` blocks:

```typescript
it("sets existing user from Firestore on sign-in", async () => {
  vi.mocked(userApi.getById).mockResolvedValue(mockUser);
  // trigger async action
  await invokeAuthCallback!(mockFirebaseUser);
  // assert
  expect(useAuthStore.getState().user).toEqual(mockUser);
});
```

### The error-handling trifecta

When testing the error path of any async operation in this project, verify all three parts of the pattern:

```typescript
it("catches error, logs, and toasts on failure", async () => {
  vi.mocked(someAsyncCall).mockRejectedValue(new Error("fail"));

  await action();

  expect(logger.error).toHaveBeenCalledWith("contextName", expect.any(Error));
  expect(toast.error).toHaveBeenCalled();
  expect(result).toBe(/* safe fallback: null, false, etc. */);
});
```

### Casting mock return values

When using `vi.mocked(fn).mockReturnValue(...)` with complex library types (e.g. `ReturnType<typeof useTranslation>`), a direct `as ReturnType<...>` cast often fails because the mock object doesn't overlap enough with the full type. Always cast through `unknown` first:

```typescript
// ❌ TS2352: neither type sufficiently overlaps
vi.mocked(useTranslation).mockReturnValue({ i18n: mockI18n } as ReturnType<typeof useTranslation>);

// ✅ correct
vi.mocked(useTranslation).mockReturnValue({ i18n: mockI18n } as unknown as ReturnType<typeof useTranslation>);
```

### Array index access

The project has `noUncheckedIndexedAccess: true` in `tsconfig.json`. This means `array[0]` is typed as `T | undefined`, not `T`. Always use optional chaining when accessing array elements in assertions:

```typescript
// ❌ TS2532: Object is possibly 'undefined'
expect(result.current.entries[0].level).toBe(2);

// ✅ correct
expect(result.current.entries[0]?.level).toBe(2);
```

### Biome lint suppressions

The project uses Biome with `noConsole: warn` (only `console.log` is allowed). When testing a module that wraps `console.*` (e.g., `logger.ts`), you need to spy on it — Biome flags `expect(console.error)` as a member access even though it's not a direct call.

Add `biome-ignore` only on the `expect(console.*)` assertion lines, not on `vi.spyOn`:

```typescript
// vi.spyOn is fine — no biome-ignore needed
vi.spyOn(console, "error").mockImplementation(() => undefined);

// biome-ignore lint/suspicious/noConsole: asserting on spied console.error — not a direct call
expect(console.error).toHaveBeenCalledWith("[ctx]:", expect.any(Error));
```

## After writing the test file

Run lint:fix to auto-format the generated file before finishing:

```bash
bun run lint:fix
```

This handles all Biome formatting rules automatically (line width, trailing commas, quotes, etc.) — no need to manually match the formatter output.

## What NOT to do

- Don't test implementation details — test behavior and return values
- Don't mock the module under test — mock its dependencies
- Don't use `renderHook` for Zustand stores — use `getState()`/`setState()` directly
- Don't write `// TODO: add more tests` comments — either write the test or don't
- Don't generate snapshot tests — they add noise and break on any formatting change
- Don't add `@ts-ignore` or `as any` — type your mocks properly
