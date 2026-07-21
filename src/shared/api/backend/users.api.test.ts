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
import type { RoleActionResponse, UserRole, UserSyncResponse } from "./types/backend.types";
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

      expect(backendClient.get).toHaveBeenCalledWith("/api/users/info/uid-test-user");
      expect(result).toEqual(mockUserSyncResponse);
    });

    it("propagates error if request fails", async () => {
      const error = new Error("Not found");
      vi.mocked(backendClient.get).mockRejectedValue(error);

      await expect(usersApi.getInfo("uid-test-user")).rejects.toThrow("Not found");
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
});
