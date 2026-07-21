import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import { auth } from "@/shared/api/firebase";
import { logger } from "@/shared/lib/logger";
import { useLogout } from "./use-logout";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/auth", () => ({
  signOut: vi.fn(),
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

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockSetUser = vi.fn();

// ─── Tests ───────────────────────────────────────────────────────────────────

// Mock state for useAuthStore selector
const mockAuthState = { setUser: mockSetUser };

describe("useLogout", () => {
  beforeEach(() => {
    // Use mockImplementation so the selector arrow function is actually invoked
    vi.mocked(useAuthStore).mockImplementation((selector) => selector(mockAuthState as never));
    vi.clearAllMocks();
  });

  describe("logout", () => {
    it("calls signOut with auth on logout()", async () => {
      vi.mocked(signOut).mockResolvedValue(undefined);

      const { logout } = useLogout();
      await logout();

      expect(signOut).toHaveBeenCalledWith(auth);
    });

    it("calls setUser(null) after successful signOut", async () => {
      vi.mocked(signOut).mockResolvedValue(undefined);

      const { logout } = useLogout();
      await logout();

      expect(mockSetUser).toHaveBeenCalledWith(null);
    });

    it("logs error and shows toast on signOut failure", async () => {
      const signOutError = new Error("network-error");
      vi.mocked(signOut).mockRejectedValue(signOutError);

      const { logout } = useLogout();
      await logout();

      expect(logger.error).toHaveBeenCalledWith("useLogout", signOutError);
      expect(toast.error).toHaveBeenCalled();
    });

    it("does not call setUser if signOut throws", async () => {
      vi.mocked(signOut).mockRejectedValue(new Error("network-error"));

      const { logout } = useLogout();
      await logout();

      expect(mockSetUser).not.toHaveBeenCalled();
    });
  });
});
