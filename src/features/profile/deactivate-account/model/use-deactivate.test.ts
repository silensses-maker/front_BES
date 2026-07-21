import { act, renderHook } from "@testing-library/react";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, userApi } from "@/entities/user";
import { logger } from "@/shared/lib/logger";
import { useDeactivate } from "./use-deactivate";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/entities/user", () => ({
  useAuthStore: vi.fn(),
  userApi: {
    update: vi.fn(),
  },
}));

vi.mock("@/shared/api/firebase", () => ({
  auth: {},
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

// ─── Types ───────────────────────────────────────────────────────────────────

import type { User } from "@/entities/user";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockUser: User = {
  uid: "uid-researcher",
  email: "researcher@univalle.edu.co",
  name: "Researcher",
  photo: "",
  roles: ["Researcher"],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useDeactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(signOut).mockResolvedValue(undefined);
    vi.mocked(useAuthStore).mockImplementation((selector) =>
      selector({
        user: mockUser,
        loading: false,
        setUser: vi.fn(),
        setLoading: vi.fn(),
        observeAuthState: vi.fn(),
      }),
    );
  });

  // ── initial state ──────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("exposes loading as false initially", () => {
      const { result } = renderHook(() => useDeactivate());
      expect(result.current.loading).toBe(false);
    });
  });

  // ── deactivate — null guard ────────────────────────────────────────────────

  describe("deactivate — null guard", () => {
    it("returns early and does not call userApi.update when user is null", async () => {
      vi.mocked(useAuthStore).mockImplementation((selector) =>
        selector({
          user: null,
          loading: false,
          setUser: vi.fn(),
          setLoading: vi.fn(),
          observeAuthState: vi.fn(),
        }),
      );

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(userApi.update).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });
  });

  // ── deactivate — happy path ────────────────────────────────────────────────

  describe("deactivate — happy path", () => {
    it("sets loading to true before calling userApi.update", async () => {
      let loadingDuringUpdate = false;

      vi.mocked(userApi.update).mockImplementation(async () => {
        loadingDuringUpdate = true;
        return true;
      });

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(loadingDuringUpdate).toBe(true);
    });

    it("calls userApi.update with uid and deactivated: true", async () => {
      vi.mocked(userApi.update).mockResolvedValue(true);

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(userApi.update).toHaveBeenCalledWith("uid-researcher", { deactivated: true });
    });

    it("calls signOut after userApi.update succeeds", async () => {
      vi.mocked(userApi.update).mockResolvedValue(true);

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(signOut).toHaveBeenCalledOnce();
    });
  });

  // ── deactivate — error path ────────────────────────────────────────────────

  describe("deactivate — error path", () => {
    it("logs error and shows toast.error when userApi.update throws", async () => {
      const error = new Error("update failed");
      vi.mocked(userApi.update).mockRejectedValue(error);

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(logger.error).toHaveBeenCalledWith("useDeactivate", error);
      expect(toast.error).toHaveBeenCalled();
    });

    it("sets loading to false on error", async () => {
      vi.mocked(userApi.update).mockRejectedValue(new Error("update failed"));

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(result.current.loading).toBe(false);
    });
  });
});
