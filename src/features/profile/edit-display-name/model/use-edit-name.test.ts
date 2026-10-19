import { act, renderHook } from "@testing-library/react";
import { updateProfile } from "firebase/auth";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import { logger } from "@/shared/lib/logger";
import { DISPLAY_NAME_MAX_LENGTH, useEditName } from "./use-edit-name";

// ─── Module mocks ────────────────────────────────────────────────────────────

const { mockAuth, mockFirebaseUser } = vi.hoisted(() => {
  const mockFirebaseUser = { uid: "uid-researcher", getIdToken: vi.fn() };
  const mockAuth: { currentUser: typeof mockFirebaseUser | null } = {
    currentUser: mockFirebaseUser,
  };
  return { mockAuth, mockFirebaseUser };
});

vi.mock("firebase/auth", () => ({
  updateProfile: vi.fn(),
}));

vi.mock("@/shared/api/firebase", () => ({
  auth: mockAuth,
}));

vi.mock("@/entities/user", () => ({
  useAuthStore: vi.fn(),
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

function mockStoreUser(user: User | null) {
  vi.mocked(useAuthStore).mockImplementation((selector) =>
    selector({
      user,
      loading: false,
      setUser: mockSetUser,
      setLoading: vi.fn(),
      observeAuthState: vi.fn(),
    }),
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useEditName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = mockFirebaseUser;
    vi.mocked(updateProfile).mockResolvedValue(undefined);
    mockFirebaseUser.getIdToken.mockResolvedValue("fresh-token");
    mockStoreUser(mockUser);
  });

  // ── initial state ──────────────────────────────────────────────────────────

  describe("initial state", () => {
    it("exposes currentName from user.name", () => {
      const { result } = renderHook(() => useEditName());
      expect(result.current.currentName).toBe("Researcher");
    });

    it("exposes currentName as empty string when user is null", () => {
      mockStoreUser(null);

      const { result } = renderHook(() => useEditName());
      expect(result.current.currentName).toBe("");
    });

    it("exposes loading as false initially", () => {
      const { result } = renderHook(() => useEditName());
      expect(result.current.loading).toBe(false);
    });
  });

  // ── editName — guards ──────────────────────────────────────────────────────

  describe("editName — guards", () => {
    it("returns early and does not call updateProfile when user is null", async () => {
      mockStoreUser(null);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(updateProfile).not.toHaveBeenCalled();
    });

    it("returns early and does not call updateProfile when newName is empty string", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName(""));

      expect(updateProfile).not.toHaveBeenCalled();
    });

    it("returns early and does not call updateProfile when newName is whitespace only", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("   "));

      expect(updateProfile).not.toHaveBeenCalled();
    });

    it("accepts a name of exactly the maximum length", async () => {
      const name = "a".repeat(DISPLAY_NAME_MAX_LENGTH);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName(name));

      expect(updateProfile).toHaveBeenCalledWith(mockFirebaseUser, { displayName: name });
    });

    it("returns early when the trimmed name exceeds the backend's users.name width", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("a".repeat(DISPLAY_NAME_MAX_LENGTH + 1)));

      expect(DISPLAY_NAME_MAX_LENGTH).toBe(255);
      expect(updateProfile).not.toHaveBeenCalled();
      expect(mockSetUser).not.toHaveBeenCalled();
    });
  });

  // ── editName — happy path ──────────────────────────────────────────────────

  describe("editName — happy path", () => {
    it("sets loading to true before calling updateProfile", async () => {
      let loadingDuringUpdate = false;

      vi.mocked(updateProfile).mockImplementation(async () => {
        loadingDuringUpdate = true;
      });

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(loadingDuringUpdate).toBe(true);
    });

    it("updates the Firebase Auth display name with the trimmed name", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("  New Name  "));

      expect(updateProfile).toHaveBeenCalledWith(mockFirebaseUser, { displayName: "New Name" });
    });

    it("force-refreshes the ID token after updateProfile so the backend mirror sees the name", async () => {
      const order: string[] = [];
      vi.mocked(updateProfile).mockImplementation(async () => {
        order.push("updateProfile");
      });
      mockFirebaseUser.getIdToken.mockImplementation(async () => {
        order.push("getIdToken");
        return "fresh-token";
      });

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(mockFirebaseUser.getIdToken).toHaveBeenCalledWith(true);
      expect(order).toEqual(["updateProfile", "getIdToken"]);
    });

    it("calls setUser with updated user when update succeeds", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(mockSetUser).toHaveBeenCalledWith({ ...mockUser, name: "New Name" });
    });

    it("shows toast.success when update succeeds", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(toast.success).toHaveBeenCalledWith("profile.successEditName");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("still saves the name when only the token refresh fails, and logs it", async () => {
      const error = new Error("auth/network-request-failed");
      mockFirebaseUser.getIdToken.mockRejectedValue(error);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(logger.error).toHaveBeenCalledWith("useEditName", error);
      expect(mockSetUser).toHaveBeenCalledWith({ ...mockUser, name: "New Name" });
      expect(toast.success).toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("sets loading to false in the finally block after success", async () => {
      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(result.current.loading).toBe(false);
    });
  });

  // ── editName — error path ──────────────────────────────────────────────────

  describe("editName — error path", () => {
    it("logs error and shows toast.error when updateProfile throws", async () => {
      const error = new Error("update failed");
      vi.mocked(updateProfile).mockRejectedValue(error);

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(logger.error).toHaveBeenCalledWith("useEditName", error);
      expect(toast.error).toHaveBeenCalledWith("profile.errorEditName");
    });

    it("does not refresh the token nor call setUser when updateProfile throws", async () => {
      vi.mocked(updateProfile).mockRejectedValue(new Error("update failed"));

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(mockFirebaseUser.getIdToken).not.toHaveBeenCalled();
      expect(mockSetUser).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("shows toast.error without calling updateProfile when there is no Firebase user", async () => {
      mockAuth.currentUser = null;

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(updateProfile).not.toHaveBeenCalled();
      expect(mockSetUser).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith("useEditName", expect.any(Error));
      expect(toast.error).toHaveBeenCalledWith("profile.errorEditName");
    });

    it("sets loading to false in the finally block after error", async () => {
      vi.mocked(updateProfile).mockRejectedValue(new Error("update failed"));

      const { result } = renderHook(() => useEditName());
      await act(() => result.current.editName("New Name"));

      expect(result.current.loading).toBe(false);
    });
  });
});
