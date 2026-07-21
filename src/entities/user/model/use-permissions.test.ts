import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../types/user.types";
import { usePermissions } from "./use-permissions";

// ─── Module mocks ────────────────────────────────────────────────────────────

type AuthStoreState = { user: User | null; loading: boolean };

let mockStoreState: AuthStoreState = { user: null, loading: false };

vi.mock("./user.store", () => ({
  useAuthStore: (selector: (state: AuthStoreState) => unknown) => selector(mockStoreState),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockUser: User = {
  uid: "uid-researcher",
  email: "researcher@univalle.edu.co",
  name: "Researcher",
  photo: "",
  roles: ["Researcher"],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("usePermissions", () => {
  beforeEach(() => {
    mockStoreState = { user: null, loading: false };
    vi.clearAllMocks();
  });

  describe("roles derivation", () => {
    it("initializes roles from user.roles when user exists", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.roles).toEqual(["Researcher"]);
    });

    it("defaults roles to Guest when user is null", () => {
      mockStoreState = { user: null, loading: false };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.roles).toEqual(["Guest"]);
    });
  });

  describe("limits memoization", () => {
    it("memoizes limits based on roles — returns Researcher limits for Researcher role", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.limits.maxAgents).toBe(1000);
      expect(result.current.limits.maxIterations).toBe(1000);
      expect(result.current.limits.densityFactor).toBe(0.75);
    });

    it("recomputes limits when roles change", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result, rerender } = renderHook(() => usePermissions());
      expect(result.current.limits.maxAgents).toBe(1000);

      mockStoreState = {
        user: { ...mockUser, roles: ["Guest"] },
        loading: false,
      };
      rerender();

      expect(result.current.limits.maxAgents).toBe(10);
    });
  });

  describe("permissions memoization", () => {
    it("memoizes permissions based on roles — returns Researcher permissions", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.permissions).toContain("runExtendedSimulations");
      expect(result.current.permissions).toContain("viewDashboard");
    });

    it("recomputes permissions when roles change", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result, rerender } = renderHook(() => usePermissions());
      expect(result.current.permissions).toContain("runExtendedSimulations");

      mockStoreState = {
        user: { ...mockUser, roles: ["Guest"] },
        loading: false,
      };
      rerender();

      expect(result.current.permissions).not.toContain("runExtendedSimulations");
    });
  });

  describe("hasPermission", () => {
    it("returns true when permission exists in the permissions array", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("viewDashboard")).toBe(true);
    });

    it("returns false when permission does not exist in the permissions array", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("manageUsers")).toBe(false);
    });
  });

  describe("loading state", () => {
    it("exposes loading state from auth store when true", () => {
      mockStoreState = { user: null, loading: true };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.loading).toBe(true);
    });

    it("exposes loading state from auth store when false", () => {
      mockStoreState = { user: mockUser, loading: false };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.loading).toBe(false);
    });
  });
});
