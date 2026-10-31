import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("./auth-interceptor", () => ({}));

vi.mock("./client", () => ({
  backendClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// ─── Types ───────────────────────────────────────────────────────────────────

import { backendClient } from "./client";
import type {
  AdminUser,
  RoleActionResponse,
  UserRole,
  UserSyncResponse,
} from "./types/backend.types";
import { usersApi } from "./users.api";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockUserSyncResponse: UserSyncResponse = {
  uid: "uid-test-user",
  email: "testuser@univalle.edu.co",
  name: "Test User",
  photo: null,
  roles: ["BaseUser"],
  usageLimits: {
    maxAgents: 100,
    maxIterations: 100,
    densityFactor: 0.5,
  },
  deactivated: false,
};

const mockRoleActionResponse: RoleActionResponse = {
  uid: "uid-test-user",
  role: "Researcher",
  action: "added",
};

const mockAdminUser: AdminUser = {
  uid: "uid-test-user",
  email: "testuser@univalle.edu.co",
  name: "Test User",
  photo: null,
  roles: ["Guest", "Researcher"],
  effectiveRole: "Researcher",
  usageLimits: { maxAgents: 1000, maxIterations: 1000, densityFactor: 0.75, maxNetworks: 20 },
  deactivated: false,
  createdAt: "2026-10-31T12:34:56Z",
  updatedAt: "2026-10-31T12:34:56Z",
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("usersApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sync", () => {
    it("returns UserSyncResponse when POST succeeds", async () => {
      vi.mocked(backendClient.post).mockResolvedValue({
        data: mockUserSyncResponse,
      });

      const result = await usersApi.sync();

      expect(backendClient.post).toHaveBeenCalledWith("/api/users/sync");
      expect(result).toEqual(mockUserSyncResponse);
    });

    it("propagates error if request fails", async () => {
      const error = new Error("Network error");
      vi.mocked(backendClient.post).mockRejectedValue(error);

      await expect(usersApi.sync()).rejects.toThrow("Network error");
    });
  });

  describe("getInfo", () => {
    it("returns UserSyncResponse for given uid", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({
        data: mockUserSyncResponse,
      });

      const result = await usersApi.getInfo("uid-test-user");

      expect(backendClient.get).toHaveBeenCalledWith("/api/users/info/uid-test-user", undefined);
      expect(result).toEqual(mockUserSyncResponse);
    });

    it("passes the timeout option to the request", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({ data: mockUserSyncResponse });

      await usersApi.getInfo("uid-test-user", { timeout: 5000 });

      expect(backendClient.get).toHaveBeenCalledWith("/api/users/info/uid-test-user", {
        timeout: 5000,
      });
    });

    it("propagates error if request fails", async () => {
      const error = new Error("Not found");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(usersApi.getInfo("uid-test-user")).rejects.toThrow("Not found");
    });
  });

  describe("deactivateMe", () => {
    it("POSTs to the deactivate endpoint and returns its body", async () => {
      vi.mocked(backendClient.post).mockResolvedValue({ data: { deactivated: true } });

      const result = await usersApi.deactivateMe();

      expect(backendClient.post).toHaveBeenCalledWith("/api/users/me/deactivate");
      expect(result).toEqual({ deactivated: true });
    });

    it("propagates error if request fails", async () => {
      const error = new Error("Request failed with status code 500");
      vi.mocked(backendClient.post).mockRejectedValue(error);

      await expect(usersApi.deactivateMe()).rejects.toThrow(error);
    });
  });

  describe("addRole", () => {
    it("returns RoleActionResponse when role is added", async () => {
      const role: UserRole = "Researcher";
      vi.mocked(backendClient.put).mockResolvedValue({
        data: mockRoleActionResponse,
      });

      const result = await usersApi.addRole("uid-test-user", role);

      expect(backendClient.put).toHaveBeenCalledWith("/api/users/role/uid-test-user/Researcher");
      expect(result).toEqual(mockRoleActionResponse);
    });

    it("propagates error if request fails", async () => {
      const role: UserRole = "Researcher";
      const error = new Error("Forbidden");
      vi.mocked(backendClient.put).mockRejectedValue(error);

      await expect(usersApi.addRole("uid-test-user", role)).rejects.toThrow("Forbidden");
    });
  });
  // ── SuperAdministrator endpoints ──────────────────────────────────────────

  describe("list", () => {
    it("GETs /api/users with the paging and search query", async () => {
      const response = { users: [mockAdminUser], total: 1, limit: 50, offset: 0 };
      vi.mocked(backendClient.get).mockResolvedValue({ data: response });

      const result = await usersApi.list({ limit: 50, offset: 0, q: "test" });

      expect(backendClient.get).toHaveBeenCalledWith("/api/users", {
        params: { limit: 50, offset: 0, q: "test" },
      });
      expect(result).toEqual(response);
    });

    it("sends an empty query object when called without params", async () => {
      vi.mocked(backendClient.get).mockResolvedValue({
        data: { users: [], total: 0, limit: 50, offset: 0 },
      });

      await usersApi.list();

      expect(backendClient.get).toHaveBeenCalledWith("/api/users", { params: {} });
    });

    it("propagates error if request fails", async () => {
      vi.mocked(backendClient.get).mockRejectedValue(new Error("Forbidden"));

      await expect(usersApi.list()).rejects.toThrow("Forbidden");
    });
  });

  describe("roles", () => {
    it("GETs the role catalog", async () => {
      const response = {
        roles: [{ role: "Guest", priority: 0, usageLimits: mockAdminUser.usageLimits }],
      };
      vi.mocked(backendClient.get).mockResolvedValue({ data: response });

      const result = await usersApi.roles();

      expect(backendClient.get).toHaveBeenCalledWith("/api/users/roles");
      expect(result).toEqual(response);
    });
  });

  describe("setRole", () => {
    it("PUTs the role in the body and returns the updated user", async () => {
      vi.mocked(backendClient.put).mockResolvedValue({ data: mockAdminUser });

      const result = await usersApi.setRole("uid-test-user", "Researcher");

      expect(backendClient.put).toHaveBeenCalledWith("/api/users/uid-test-user/role", {
        role: "Researcher",
      });
      expect(result).toEqual(mockAdminUser);
    });

    it("propagates error if request fails", async () => {
      vi.mocked(backendClient.put).mockRejectedValue(new Error("Forbidden"));

      await expect(usersApi.setRole("uid-test-user", "Guest")).rejects.toThrow("Forbidden");
    });
  });

  describe("deactivate / reactivate", () => {
    it("POSTs to the user's deactivate endpoint", async () => {
      const deactivated = { ...mockAdminUser, deactivated: true };
      vi.mocked(backendClient.post).mockResolvedValue({ data: deactivated });

      const result = await usersApi.deactivate("uid-test-user");

      expect(backendClient.post).toHaveBeenCalledWith("/api/users/uid-test-user/deactivate");
      expect(result).toEqual(deactivated);
    });

    it("POSTs to the user's reactivate endpoint", async () => {
      vi.mocked(backendClient.post).mockResolvedValue({ data: mockAdminUser });

      const result = await usersApi.reactivate("uid-test-user");

      expect(backendClient.post).toHaveBeenCalledWith("/api/users/uid-test-user/reactivate");
      expect(result).toEqual(mockAdminUser);
    });

    it("propagates error if the request fails", async () => {
      vi.mocked(backendClient.post).mockRejectedValue(new Error("Not found"));

      await expect(usersApi.reactivate("missing")).rejects.toThrow("Not found");
    });
  });
});
