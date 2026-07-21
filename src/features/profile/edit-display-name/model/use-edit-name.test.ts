import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, userApi } from "@/entities/user";
import { logger } from "@/shared/lib/logger";
import { useEditName } from "./use-edit-name";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/entities/user", () => ({
  useAuthStore: vi.fn(),
  userApi: {
    update: vi.fn(),
  },
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
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

const mockSetUser = vi.fn();

const mockUser: User = {
  uid: "uid-researcher",
  email: "researcher@univalle.edu.co",
  name: "Researcher",
  photo: "",
  roles: ["Researcher"],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useEditName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockImplementation((selector) =>
      selector({
        user: mockUser,
        loading: false,
        setUser: mockSetUser,
        setLoading: vi.fn(),
        observeAuthState: vi.fn(),
      }),
    );
  });

  // ── initial state ──────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("exposes currentName from user.name", () => {
      const { result } = renderHook(() => useEditName());
      expect(result.current.currentName).toBe("Researcher");
    });

    it("exposes currentName as empty string when user is null", () => {
      vi.mocked(useAuthStore).mockImplementation((selector) =>
        selector({
          user: null,
          loading: false,
          setUser: mockSetUser,
          setLoading: vi.fn(),
          observeAuthState: vi.fn(),
        }),
      );

      const { result } = renderHook(() => useEditName());
      expect(result.current.currentName).toBe("");
    });

    it("exposes loading as false initially", () => {
      const { result } = renderHook(() => useEditName());
      expect(result.current.loading).toBe(false);
    });
  });

  // ── editName — null/empty guards ───────────────────────────────────────────

  describe("editName — null guard", () => {
    it("returns early and does not call userApi.update when user is null", async () => {
      vi.mocked(useAuthStore).mockImplementation((selector) =>
        selector({
          user: null,
          loading: false,
          setUser: mockSetUser,
          setLoading: vi.fn(),
          observeAuthState: vi.fn(),
        }),
      );

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(userApi.update).not.toHaveBeenCalled();
    });

    it("returns early and does not call userApi.update when newName is empty string", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName(""));

      expect(userApi.update).not.toHaveBeenCalled();
    });

    it("returns early and does not call userApi.update when newName is whitespace only", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("   "));

      expect(userApi.update).not.toHaveBeenCalled();
    });
  });

  // ── editName — happy path ──────────────────────────────────────────────────

  describe("editName — happy path", () => {
    it("sets loading to true before calling userApi.update", async () => {
      let loadingDuringUpdate = false;

      vi.mocked(userApi.update).mockImplementation(async () => {
        loadingDuringUpdate = true;
        return true;
      });

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(loadingDuringUpdate).toBe(true);
    });

    it("calls userApi.update with uid and trimmed name", async () => {
      vi.mocked(userApi.update).mockResolvedValue(true);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("  New Name  "));

      expect(userApi.update).toHaveBeenCalledWith("uid-researcher", { name: "New Name" });
    });

    it("calls setUser with updated user when update succeeds", async () => {
      vi.mocked(userApi.update).mockResolvedValue(true);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(mockSetUser).toHaveBeenCalledWith({ ...mockUser, name: "New Name" });
    });

    it("shows toast.success when update succeeds", async () => {
      vi.mocked(userApi.update).mockResolvedValue(true);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(toast.success).toHaveBeenCalled();
    });

    it("does not call setUser when update returns falsy", async () => {
      vi.mocked(userApi.update).mockResolvedValue(false);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(mockSetUser).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("sets loading to false in the finally block after success", async () => {
      vi.mocked(userApi.update).mockResolvedValue(true);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(result.current.loading).toBe(false);
    });
  });

  // ── editName — error path ──────────────────────────────────────────────────

  describe("editName — error path", () => {
    it("logs error and shows toast.error when userApi.update throws", async () => {
      const error = new Error("update failed");
      vi.mocked(userApi.update).mockRejectedValue(error);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(logger.error).toHaveBeenCalledWith("useEditName", error);
      expect(toast.error).toHaveBeenCalled();
    });

    it("does not call setUser when userApi.update throws", async () => {
      vi.mocked(userApi.update).mockRejectedValue(new Error("update failed"));

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(mockSetUser).not.toHaveBeenCalled();
    });

    it("sets loading to false in the finally block after error", async () => {
      vi.mocked(userApi.update).mockRejectedValue(new Error("update failed"));

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(result.current.loading).toBe(false);
    });
  });
});
