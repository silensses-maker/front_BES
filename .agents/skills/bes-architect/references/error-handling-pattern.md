# Error Handling Pattern

Every async operation in a feature hook in `front_BES` must follow this exact pattern. No exceptions.

## The pattern

```ts
import { toast } from "sonner";
import { logger } from "@/shared/lib/logger";

const doSomething = async () => {
  setLoading(true);
  try {
    // async work
  } catch (error) {
    logger.error("useHookName", error);
    toast.error(t("namespace.errorSomething"));
  } finally {
    setLoading(false);
  }
};
```

## Why each piece exists

- `logger.error(context, error)` — always first, for observability. The logger lives at `shared/lib/logger.ts`. The `context` string is the hook name (`"useLogin"`, `"useDeactivate"`, etc.) so logs are greppable.
- `toast.error(t(...))` — always second, for user feedback via `sonner`. The message **must be a translated key**, never a hardcoded string (see `i18n-protocol.md`).
- `finally { setLoading(false) }` — guarantees the UI never gets stuck in a loading state, even on unexpected throws.

## Where this applies

- Any `model/` hook in a feature that performs Firebase calls, `signOut`, `signIn`, Firestore writes, or any async side effect.
- The `api/` layer (`userApi`, etc.) handles its own internal errors, but feature hooks must still wrap calls in try/catch because unexpected errors (network drop, auth token expiry, Firestore offline) can propagate up.

## Review rule

When reviewing code, flag any async feature hook missing `try/catch` + `logger.error` + `toast.error` + `finally setLoading(false)` as a structural issue, not a stylistic preference.
