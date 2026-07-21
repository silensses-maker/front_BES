# Example: Zustand Store Test

**Source:** `src/entities/user/model/user.store.test.ts`
**Tests:** `useAuthStore` — a Zustand store with sync actions (`setUser`, `setLoading`) and an async action (`observeAuthState`) that integrates with Firebase Auth and Firestore.

This is the canonical pattern for testing Zustand stores in this project.

## Key patterns

- Mock external modules at the top with `vi.mock()`
- Define typed fixtures (`MockFirebaseUser`, `mockUser`)
- Reset store state in `beforeEach` with `useStore.setState()`
- Call actions via `useStore.getState().actionName()`
- Assert state via `useStore.getState().field`

## Full test file

```typescript
import { onAuthStateChanged, signOut } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { userApi } from "../api/user.api";
import type { User } from "../types/user.types";
import { useAuthStore } from "./user.store";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/shared/api/firebase", () => ({
  auth: {},
}));

vi.mock("../api/user.api", () => ({
  userApi: {
    getById: vi.fn(),
    create: vi.fn(),
  },
}));

// ─── Types ───────────────────────────────────────────────────────────────────

type MockFirebaseUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

type AuthStateCallback = (user: MockFirebaseUser | null) => Promise<void>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockUser: User = {
  uid: "uid-researcher",
  email: "researcher@univalle.edu.co",
  name: "Researcher",
  photo: "",
  roles: ["Researcher"],
};

const mockFirebaseUser: MockFirebaseUser = {
  uid: "uid-researcher",
  email: "researcher@univalle.edu.co",
  displayName: "Researcher",
  photoURL: null,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: true });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts with user null and loading true", () => {
      const { user, loading } = useAuthStore.getState();
      expect(user).toBeNull();
      expect(loading).toBe(true);
    });
  });

  describe("setUser", () => {
    it("sets user in state", () => {
      useAuthStore.getState().setUser(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it("clears user when called with null", () => {
      useAuthStore.setState({ user: mockUser });
      useAuthStore.getState().setUser(null);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe("setLoading", () => {
    it("sets loading to false", () => {
      useAuthStore.getState().setLoading(false);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("sets loading to true", () => {
      useAuthStore.setState({ loading: false });
      useAuthStore.getState().setLoading(true);
      expect(useAuthStore.getState().loading).toBe(true);
    });
  });

  describe("observeAuthState", () => {
    let invokeAuthCallback: AuthStateCallback | undefined;

    beforeEach(() => {
      vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
        invokeAuthCallback = cb as unknown as AuthStateCallback;
        return vi.fn();
      });
      vi.mocked(signOut).mockResolvedValue(undefined);
    });

    it("sets loading to true when called", () => {
      useAuthStore.setState({ loading: false });
      useAuthStore.getState().observeAuthState();
      expect(useAuthStore.getState().loading).toBe(true);
    });

    it("returns an unsubscribe function", () => {
      const unsubscribe = useAuthStore.getState().observeAuthState();
      expect(typeof unsubscribe).toBe("function");
    });

    it("sets user null and loading false when no firebase user is signed in", async () => {
      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!(null);

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("sets existing user from Firestore on sign-in", async () => {
      vi.mocked(userApi.getById).mockResolvedValue(mockUser);

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!(mockFirebaseUser);

      expect(userApi.getById).toHaveBeenCalledWith("uid-researcher");
      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("signs out and clears state when the account is deactivated", async () => {
      const deactivatedUser: User = { ...mockUser, uid: "uid-deactivated", deactivated: true };
      vi.mocked(userApi.getById).mockResolvedValue(deactivatedUser);

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!({ ...mockFirebaseUser, uid: "uid-deactivated" });

      expect(signOut).toHaveBeenCalledOnce();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("creates a Guest user and sets state on first login", async () => {
      vi.mocked(userApi.getById).mockResolvedValue(null);
      vi.mocked(userApi.create).mockResolvedValue(true);

      const newFirebaseUser: MockFirebaseUser = {
        uid: "new-uid",
        email: "new@test.com",
        displayName: "New User",
        photoURL: "https://photo.jpg",
      };

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!(newFirebaseUser);

      expect(userApi.create).toHaveBeenCalledWith({
        uid: "new-uid",
        email: "new@test.com",
        name: "New User",
        photo: "https://photo.jpg",
        roles: ["Guest"],
      });
      expect(useAuthStore.getState().user).toMatchObject({ uid: "new-uid", roles: ["Guest"] });
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("falls back to empty strings when firebase user has null fields on first login", async () => {
      vi.mocked(userApi.getById).mockResolvedValue(null);
      vi.mocked(userApi.create).mockResolvedValue(true);

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!({
        uid: "uid-null-fields",
        email: null,
        displayName: null,
        photoURL: null,
      });

      const createdUser = useAuthStore.getState().user;
      expect(createdUser?.email).toBe("");
      expect(createdUser?.name).toBe("");
      expect(createdUser?.photo).toBe("");
    });
  });
});
```
