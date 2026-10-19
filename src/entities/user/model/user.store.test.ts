import { onAuthStateChanged, signOut } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type UserInfoResponse, usersApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";
import { resolveMaxNetworks } from "../lib/permissions";
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

vi.mock("@/shared/api/backend", () => ({
  usersApi: { getInfo: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
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
  displayName: "Edited name",
  photoURL: "https://google.photo.jpg",
};

/** GET /api/users/info after the account was promoted to Researcher. */
const researcherInfo: UserInfoResponse = {
  uid: "uid-researcher",
  email: "mirror@univalle.edu.co",
  // The backend's mirror of the token: never shown.
  name: "Researcher (backend mirror)",
  roles: ["Researcher"],
  usageLimits: { maxAgents: 1000, maxIterations: 1000, densityFactor: 0.75, maxNetworks: 20 },
  deactivated: false,
};

const guestInfo: UserInfoResponse = {
  uid: "new-uid",
  email: "new@test.com",
  name: "New User",
  roles: ["Guest"],
  usageLimits: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5, maxNetworks: 1 },
  deactivated: false,
};

/** 401 the backend sends to every REST call of a deactivated account (FirebaseAuthDirective). */
const deactivatedError = Object.assign(new Error("Request failed with status code 401"), {
  isAxiosError: true,
  response: { status: 401, data: { error: "unauthorized", message: "Account is deactivated" } },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: true });
    vi.clearAllMocks();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("starts with user null and loading true", () => {
      const { user, loading } = useAuthStore.getState();
      expect(user).toBeNull();
      expect(loading).toBe(true);
    });
  });

  // ── setUser ────────────────────────────────────────────────────────────────

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

  // ── setLoading ─────────────────────────────────────────────────────────────

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

  // ── observeAuthState ───────────────────────────────────────────────────────

  describe("observeAuthState", () => {
    let invokeAuthCallback: AuthStateCallback | undefined;

    beforeEach(() => {
      vi.mocked(onAuthStateChanged).mockImplementation((_auth, cb) => {
        invokeAuthCallback = cb as unknown as AuthStateCallback;
        return vi.fn();
      });
      vi.mocked(signOut).mockResolvedValue(undefined);
      vi.mocked(usersApi.getInfo).mockResolvedValue(researcherInfo);
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

      expect(usersApi.getInfo).not.toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("takes identity from the Firebase user and roles/limits from the backend", async () => {
      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!(mockFirebaseUser);

      expect(usersApi.getInfo).toHaveBeenCalledWith("uid-researcher", {
        timeout: expect.any(Number),
      });
      expect(useAuthStore.getState().user).toEqual({
        uid: "uid-researcher",
        // Identity: Firebase Authentication (the edited display name, the Google photo)…
        email: "researcher@univalle.edu.co",
        name: "Edited name",
        photo: "https://google.photo.jpg",
        // …authorization: the backend.
        roles: ["Researcher"],
        usageLimits: { maxAgents: 1000, maxIterations: 1000, densityFactor: 0.75, maxNetworks: 20 },
        deactivated: false,
      });
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("maps unlimited (null) backend limits to Infinity on restore", async () => {
      vi.mocked(usersApi.getInfo).mockResolvedValue({
        ...researcherInfo,
        roles: ["Administrator"],
        usageLimits: {
          maxAgents: null,
          maxIterations: null,
          densityFactor: 1.0,
          maxNetworks: null,
        },
      });

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!(mockFirebaseUser);

      const user = useAuthStore.getState().user!;
      expect(user.roles).toEqual(["Administrator"]);
      expect(user.usageLimits).toEqual({
        maxAgents: Infinity,
        maxIterations: Infinity,
        densityFactor: 1.0,
        maxNetworks: Infinity,
      });
      expect(resolveMaxNetworks(user)).toBe(Infinity);
    });

    it("takes a brand-new account's Guest quotas from the backend", async () => {
      vi.mocked(usersApi.getInfo).mockResolvedValue(guestInfo);

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!({
        uid: "new-uid",
        email: "new@test.com",
        displayName: "New User",
        photoURL: null,
      });

      expect(useAuthStore.getState().user).toEqual({
        uid: "new-uid",
        email: "new@test.com",
        name: "New User",
        photo: "",
        roles: ["Guest"],
        usageLimits: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5, maxNetworks: 1 },
        deactivated: false,
      });
    });

    it("keeps loading until the backend answers, so no half-built user is exposed", async () => {
      const info = deferred<UserInfoResponse>();
      vi.mocked(usersApi.getInfo).mockReturnValue(info.promise);

      useAuthStore.getState().observeAuthState();
      const restoring = invokeAuthCallback!(mockFirebaseUser);
      await vi.waitFor(() => expect(usersApi.getInfo).toHaveBeenCalled());

      expect(useAuthStore.getState().loading).toBe(true);
      expect(useAuthStore.getState().user).toBeNull();

      info.resolve(researcherInfo);
      await restoring;

      expect(useAuthStore.getState().user?.roles).toEqual(["Researcher"]);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it.each([
      ["a network error", new Error("Network Error")],
      [
        "a 5xx response",
        Object.assign(new Error("Request failed with status code 503"), {
          isAxiosError: true,
          response: { status: 503, data: { error: "internal_error", message: "Down" } },
        }),
      ],
      [
        "a timeout",
        Object.assign(new Error("timeout of 5000ms exceeded"), { code: "ECONNABORTED" }),
      ],
      [
        "a 401 for an invalid token",
        Object.assign(new Error("Request failed with status code 401"), {
          isAxiosError: true,
          response: {
            status: 401,
            data: { error: "unauthorized", message: "Invalid or expired token" },
          },
        }),
      ],
    ])("keeps the Firebase session on %s, without roles or limits, and logs it", async (_, error) => {
      vi.mocked(usersApi.getInfo).mockRejectedValue(error);

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!(mockFirebaseUser);

      const user = useAuthStore.getState().user!;
      expect(user).toEqual({
        uid: "uid-researcher",
        email: "researcher@univalle.edu.co",
        name: "Edited name",
        photo: "https://google.photo.jpg",
        roles: [],
      });
      expect(useAuthStore.getState().loading).toBe(false);
      expect(signOut).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith("useAuthStore.observeAuthState", error);
      // No limits in the session: the role table (Guest) applies.
      expect(resolveMaxNetworks(user)).toBe(1);
    });

    it("signs out and clears state when the backend rejects the account as deactivated", async () => {
      vi.mocked(usersApi.getInfo).mockRejectedValue(deactivatedError);

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!({ ...mockFirebaseUser, uid: "uid-deactivated" });

      expect(usersApi.getInfo).toHaveBeenCalledWith("uid-deactivated", {
        timeout: expect.any(Number),
      });
      expect(signOut).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("signs out and clears state when the backend reports the account as deactivated", async () => {
      vi.mocked(usersApi.getInfo).mockResolvedValue({ ...researcherInfo, deactivated: true });

      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!(mockFirebaseUser);

      expect(signOut).toHaveBeenCalledOnce();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("ignores a restore that a later sign-out superseded", async () => {
      const info = deferred<UserInfoResponse>();
      vi.mocked(usersApi.getInfo).mockReturnValue(info.promise);

      useAuthStore.getState().observeAuthState();
      const restoring = invokeAuthCallback!(mockFirebaseUser);
      await vi.waitFor(() => expect(usersApi.getInfo).toHaveBeenCalled());

      await invokeAuthCallback!(null);
      info.resolve(researcherInfo);
      await restoring;

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("does not sign out a newer session when a superseded restore finds the account deactivated", async () => {
      const info = deferred<UserInfoResponse>();
      vi.mocked(usersApi.getInfo)
        .mockReturnValueOnce(info.promise)
        .mockResolvedValueOnce({ ...guestInfo, uid: "uid-other" });

      useAuthStore.getState().observeAuthState();
      const restoring = invokeAuthCallback!(mockFirebaseUser);
      await vi.waitFor(() => expect(usersApi.getInfo).toHaveBeenCalledOnce());

      await invokeAuthCallback!({ ...mockFirebaseUser, uid: "uid-other" });
      info.resolve({ ...researcherInfo, deactivated: true });
      await restoring;

      expect(signOut).not.toHaveBeenCalled();
      expect(useAuthStore.getState().user).toMatchObject({ uid: "uid-other", roles: ["Guest"] });
    });

    it("falls back to empty strings when the firebase user has null fields", async () => {
      useAuthStore.getState().observeAuthState();
      await invokeAuthCallback!({
        uid: "uid-null-fields",
        email: null,
        displayName: null,
        photoURL: null,
      });

      const user = useAuthStore.getState().user;
      expect(user?.email).toBe("");
      expect(user?.name).toBe("");
      expect(user?.photo).toBe("");
    });
  });
});
