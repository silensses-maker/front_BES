import { act, renderHook } from "@testing-library/react";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import { usersApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";
import { useDeactivate } from "./use-deactivate";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("firebase/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/entities/user", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/shared/api/backend", () => ({
  usersApi: {
    deactivateMe: vi.fn(),
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
    it("returns early and does not call the backend when user is null", async () => {
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

      expect(usersApi.deactivateMe).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });
  });

  // ── deactivate — happy path ────────────────────────────────────────────────

  describe("deactivate — happy path", () => {
    it("sets loading to true before calling the backend", async () => {
      let loadingDuringUpdate = false;

      vi.mocked(usersApi.deactivateMe).mockImplementation(async () => {
        loadingDuringUpdate = true;
        return { deactivated: true };
      });

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(loadingDuringUpdate).toBe(true);
    });

    it("deactivates the account through the backend endpoint", async () => {
      vi.mocked(usersApi.deactivateMe).mockResolvedValue({ deactivated: true });

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(usersApi.deactivateMe).toHaveBeenCalledOnce();
    });

    it("calls signOut after the backend confirms the deactivation", async () => {
      const order: string[] = [];
      vi.mocked(usersApi.deactivateMe).mockImplementation(async () => {
        order.push("deactivateMe");
        return { deactivated: true };
      });
      vi.mocked(signOut).mockImplementation(async () => {
        order.push("signOut");
      });

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(signOut).toHaveBeenCalledOnce();
      expect(order).toEqual(["deactivateMe", "signOut"]);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  // ── deactivate — error path ────────────────────────────────────────────────

  describe("deactivate — error path", () => {
    it("logs error and shows toast.error when the backend call fails", async () => {
      const error = new Error("Request failed with status code 500");
      vi.mocked(usersApi.deactivateMe).mockRejectedValue(error);

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(logger.error).toHaveBeenCalledWith("useDeactivate", error);
      expect(toast.error).toHaveBeenCalledWith("profile.errorDeactivate");
    });

    it("stays signed in when the backend call fails", async () => {
      vi.mocked(usersApi.deactivateMe).mockRejectedValue(new Error("Network Error"));

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(signOut).not.toHaveBeenCalled();
    });

    it("sets loading to false on error", async () => {
      vi.mocked(usersApi.deactivateMe).mockRejectedValue(new Error("update failed"));

      const { result } = renderHook(() => useDeactivate());
      await act(() => result.current.deactivate());

      expect(result.current.loading).toBe(false);
    });
  });
});
