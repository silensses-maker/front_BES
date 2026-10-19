import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import { usersApi } from "@/shared/api/backend";
import { auth } from "@/shared/api/firebase";
import { logger } from "@/shared/lib/logger";
import { useLogin } from "./use-login";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
}));

// Real mapper (shared with the session restore), mocked store.
vi.mock("@/entities/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/user")>()),
  useAuthStore: vi.fn(),
}));

vi.mock("@/shared/api/firebase", () => ({
  auth: {},
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

vi.mock("@/shared/api/backend", () => ({
  usersApi: { sync: vi.fn() },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockProvider = {};
const mockSetLoading = vi.fn();
const mockSetUser = vi.fn();

type MockFirebaseUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
};

/** The Firebase Authentication user returned by the sign-in: the only source of identity. */
const mockFirebaseUser: MockFirebaseUser = {
  uid: "uid-123",
  email: "user@example.com",
  displayName: "Edited Name",
  photoURL: "https://example.com/google.jpg",
};

/** POST /api/users/sync: the only source of roles and quotas (name/email/photo are a mirror). */
const mockSyncResponse = {
  uid: "uid-123",
  email: "mirror@example.com",
  name: "Backend Mirror Name",
  photo: "https://example.com/backend.jpg",
  roles: ["BaseUser" as const],
  usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5 },
  deactivated: false,
};

function mockSignIn(user: Partial<MockFirebaseUser> = {}) {
  vi.mocked(signInWithPopup).mockResolvedValue({
    user: { ...mockFirebaseUser, ...user },
  } as unknown as Awaited<ReturnType<typeof signInWithPopup>>);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// Mock state for useAuthStore selector
const mockAuthState = {
  loading: false,
  setLoading: mockSetLoading,
  setUser: mockSetUser,
};

describe("useLogin", () => {
  beforeEach(() => {
    vi.mocked(GoogleAuthProvider).mockReturnValue(mockProvider as unknown as GoogleAuthProvider);
    // Use mockImplementation so the selector arrow function is actually invoked
    vi.mocked(useAuthStore).mockImplementation((selector) => selector(mockAuthState as never));
    mockAuthState.loading = false;
    vi.clearAllMocks();
  });

  describe("login", () => {
    it("calls signInWithPopup with auth and provider on login()", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(signInWithPopup).toHaveBeenCalledWith(auth, expect.any(Object));
    });

    it("calls usersApi.sync after successful signInWithPopup", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(usersApi.sync).toHaveBeenCalledOnce();
    });

    it("sets identity from the Firebase user and roles/limits from the sync response", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(mockSetUser).toHaveBeenCalledWith({
        uid: "uid-123",
        email: "user@example.com",
        name: "Edited Name",
        photo: "https://example.com/google.jpg",
        roles: ["BaseUser"],
        usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5 },
        deactivated: false,
      });
    });

    it("maps null Firebase identity fields to empty strings", async () => {
      mockSignIn({ email: null, displayName: null, photoURL: null });
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: "", name: "", photo: "" }),
      );
    });

    it("passes maxNetworks through when the backend sends it (#122)", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue({
        ...mockSyncResponse,
        usageLimits: { ...mockSyncResponse.usageLimits, maxNetworks: 5 },
      });

      const { login } = useLogin();
      await login();

      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({
          usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5, maxNetworks: 5 },
        }),
      );
    });

    it("maps a null maxNetworks (Administrator) to Infinity", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue({
        ...mockSyncResponse,
        usageLimits: {
          maxAgents: null,
          maxIterations: null,
          densityFactor: 1.0,
          maxNetworks: null,
        },
      });

      const { login } = useLogin();
      await login();

      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({
          usageLimits: {
            maxAgents: Infinity,
            maxIterations: Infinity,
            densityFactor: 1.0,
            maxNetworks: Infinity,
          },
        }),
      );
    });

    it("omits maxNetworks when the backend does not send it, so the role table applies", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      const user = mockSetUser.mock.calls[0]?.[0] as { usageLimits: Record<string, unknown> };
      expect(user.usageLimits).not.toHaveProperty("maxNetworks");
    });

    it("maps null usageLimits fields to Infinity", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue({
        ...mockSyncResponse,
        usageLimits: { maxAgents: null, maxIterations: null, densityFactor: 1.0 },
      });

      const { login } = useLogin();
      await login();

      expect(mockSetUser).toHaveBeenCalledWith(
        expect.objectContaining({
          usageLimits: { maxAgents: Infinity, maxIterations: Infinity, densityFactor: 1.0 },
        }),
      );
    });

    it("logs error and shows toast on auth failure", async () => {
      const authError = new Error("auth/popup-closed-by-user");
      vi.mocked(signInWithPopup).mockRejectedValue(authError);

      const { login } = useLogin();
      await login();

      expect(logger.error).toHaveBeenCalledWith("useLogin", authError);
      expect(toast.error).toHaveBeenCalled();
      expect(usersApi.sync).not.toHaveBeenCalled();
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it("logs error and shows toast when sync fails", async () => {
      mockSignIn();
      const syncError = new Error("network-error");
      vi.mocked(usersApi.sync).mockRejectedValue(syncError);

      const { login } = useLogin();
      await login();

      expect(logger.error).toHaveBeenCalledWith("useLogin", syncError);
      expect(toast.error).toHaveBeenCalled();
      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it("calls setLoading(true) then setLoading(false) on success", async () => {
      mockSignIn();
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(mockSetLoading).toHaveBeenNthCalledWith(1, true);
      expect(mockSetLoading).toHaveBeenNthCalledWith(2, false);
    });

    it("calls setLoading(false) in finally even when login throws", async () => {
      vi.mocked(signInWithPopup).mockRejectedValue(new Error("popup-closed"));

      const { login } = useLogin();
      await login();

      expect(mockSetLoading).toHaveBeenNthCalledWith(1, true);
      expect(mockSetLoading).toHaveBeenNthCalledWith(2, false);
    });
  });

  describe("loading", () => {
    it("exposes loading state from auth store", () => {
      mockAuthState.loading = true;

      const { loading } = useLogin();

      expect(loading).toBe(true);
    });
  });
});
