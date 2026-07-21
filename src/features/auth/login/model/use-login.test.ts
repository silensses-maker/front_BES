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

vi.mock("@/entities/user", () => ({
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

const mockSyncResponse = {
  uid: "uid-123",
  email: "user@example.com",
  name: "Test User",
  photo: "https://example.com/photo.jpg",
  roles: ["BaseUser" as const],
  usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5 },
  deactivated: false,
};

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
      vi.mocked(signInWithPopup).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof signInWithPopup>>,
      );
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(signInWithPopup).toHaveBeenCalledWith(auth, expect.any(Object));
    });

    it("calls usersApi.sync after successful signInWithPopup", async () => {
      vi.mocked(signInWithPopup).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof signInWithPopup>>,
      );
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(usersApi.sync).toHaveBeenCalledOnce();
    });

    it("calls setUser with mapped backend response on success", async () => {
      vi.mocked(signInWithPopup).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof signInWithPopup>>,
      );
      vi.mocked(usersApi.sync).mockResolvedValue(mockSyncResponse);

      const { login } = useLogin();
      await login();

      expect(mockSetUser).toHaveBeenCalledWith({
        uid: "uid-123",
        email: "user@example.com",
        name: "Test User",
        photo: "https://example.com/photo.jpg",
        roles: ["BaseUser"],
        usageLimits: { maxAgents: 100, maxIterations: 100, densityFactor: 0.5 },
        deactivated: false,
      });
    });

    it("maps null photo to empty string", async () => {
      vi.mocked(signInWithPopup).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof signInWithPopup>>,
      );
      vi.mocked(usersApi.sync).mockResolvedValue({ ...mockSyncResponse, photo: null });

      const { login } = useLogin();
      await login();

      expect(mockSetUser).toHaveBeenCalledWith(expect.objectContaining({ photo: "" }));
    });

    it("maps null usageLimits fields to Infinity", async () => {
      vi.mocked(signInWithPopup).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof signInWithPopup>>,
      );
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
    });

    it("logs error and shows toast when sync fails", async () => {
      vi.mocked(signInWithPopup).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof signInWithPopup>>,
      );
      const syncError = new Error("network-error");
      vi.mocked(usersApi.sync).mockRejectedValue(syncError);

      const { login } = useLogin();
      await login();

      expect(logger.error).toHaveBeenCalledWith("useLogin", syncError);
      expect(toast.error).toHaveBeenCalled();
    });

    it("calls setLoading(true) then setLoading(false) on success", async () => {
      vi.mocked(signInWithPopup).mockResolvedValue(
        undefined as unknown as Awaited<ReturnType<typeof signInWithPopup>>,
      );
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
