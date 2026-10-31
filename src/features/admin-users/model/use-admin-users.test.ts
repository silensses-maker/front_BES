import { act, renderHook, waitFor } from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/entities/user";
import { type AdminUser, type BackendError, usersApi } from "@/shared/api/backend";
import { logger } from "@/shared/lib/logger";
import { PAGE_LIMIT, useAdminUsers } from "./use-admin-users";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/shared/api/firebase", () => ({ auth: {} }));

// Real role table (the catalog fallback), mocked store.
vi.mock("@/entities/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/user")>()),
  useAuthStore: vi.fn(),
}));

vi.mock("@/shared/api/backend", () => ({
  usersApi: {
    list: vi.fn(),
    roles: vi.fn(),
    setRole: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
  },
}));

vi.mock("@/shared/i18n", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "en" },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/shared/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SELF_UID = "uid-super";

function makeUser(uid: string, overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    uid,
    email: `${uid}@univalle.edu.co`,
    name: uid,
    photo: null,
    roles: ["Guest"],
    effectiveRole: "Guest",
    usageLimits: { maxAgents: 10, maxIterations: 10, densityFactor: 0.5, maxNetworks: 1 },
    deactivated: false,
    createdAt: "2026-10-31T12:00:00Z",
    updatedAt: "2026-10-31T12:00:00Z",
    ...overrides,
  };
}

const self = makeUser(SELF_UID, {
  roles: ["Guest", "SuperAdministrator"],
  effectiveRole: "SuperAdministrator",
});
const ada = makeUser("uid-ada", { name: "Ada" });
const bob = makeUser("uid-bob", {
  name: "Bob",
  roles: ["Guest", "Researcher"],
  effectiveRole: "Researcher",
});

/** An axios error carrying the backend's `{error, message}` body. */
function backendError(status: number, code: string): AxiosError<BackendError> {
  const response = { status, data: { error: code, message: code } } as AxiosResponse<BackendError>;
  return new AxiosError(code, "ERR_BAD_REQUEST", undefined, undefined, response);
}

function mockList(users: AdminUser[], total = users.length) {
  vi.mocked(usersApi.list).mockResolvedValue({ users, total, limit: PAGE_LIMIT, offset: 0 });
}

async function renderLoaded(users: AdminUser[] = [self, ada, bob], total?: number) {
  mockList(users, total);
  const hook = renderHook(() => useAdminUsers());
  await waitFor(() => expect(hook.result.current.users).toHaveLength(users.length));
  return hook;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useAdminUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockImplementation((selector) =>
      selector({
        user: {
          uid: SELF_UID,
          email: "s@u.co",
          name: "S",
          photo: "",
          roles: ["SuperAdministrator"],
        },
        loading: false,
        setUser: vi.fn(),
        setLoading: vi.fn(),
        observeAuthState: vi.fn(),
      }),
    );
    vi.mocked(usersApi.roles).mockResolvedValue({ roles: [] });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("loads the first page on mount and exposes the caller's uid", async () => {
      const { result } = await renderLoaded();

      expect(usersApi.list).toHaveBeenCalledWith({ limit: PAGE_LIMIT, offset: 0 });
      expect(result.current.total).toBe(3);
      expect(result.current.currentUid).toBe(SELF_UID);
      expect(result.current.loading).toBe(false);
    });

    it("logs and toasts when the list cannot be loaded", async () => {
      const error = new Error("Network Error");
      vi.mocked(usersApi.list).mockRejectedValue(error);

      const { result } = renderHook(() => useAdminUsers());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("adminUsers.errorLoad"));

      expect(logger.error).toHaveBeenCalledWith("useAdminUsers.load", error);
      expect(result.current.loading).toBe(false);
      expect(result.current.users).toEqual([]);
    });

    it("names the forbidden error when the caller is not a super administrator", async () => {
      vi.mocked(usersApi.list).mockRejectedValue(backendError(403, "forbidden"));

      renderHook(() => useAdminUsers());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("adminUsers.errorForbidden"));
    });

    it("refresh re-reads the current page", async () => {
      const { result } = await renderLoaded();
      mockList([self, ada]);

      await act(() => result.current.refresh());

      expect(usersApi.list).toHaveBeenCalledTimes(2);
      expect(result.current.users).toHaveLength(2);
    });
  });

  // ── search ────────────────────────────────────────────────────────────────

  describe("search", () => {
    it("requests the trimmed query from the first page after the debounce", async () => {
      const { result } = await renderLoaded();
      mockList([ada]);

      act(() => result.current.search("  ada "));
      expect(result.current.query).toBe("  ada ");
      // Not yet: the request waits for the pause.
      expect(usersApi.list).toHaveBeenCalledTimes(1);

      await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(2));
      expect(usersApi.list).toHaveBeenLastCalledWith({ limit: PAGE_LIMIT, offset: 0, q: "ada" });
      await waitFor(() => expect(result.current.users).toEqual([ada]));
    });

    it("omits q when the search is cleared", async () => {
      const { result } = await renderLoaded();
      act(() => result.current.search("ada"));
      await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(2));

      act(() => result.current.search(""));

      await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(3));
      expect(usersApi.list).toHaveBeenLastCalledWith({ limit: PAGE_LIMIT, offset: 0 });
    });
  });

  // ── paging ────────────────────────────────────────────────────────────────

  describe("paging", () => {
    it("moves to the next page while one exists and back to the first", async () => {
      const { result } = await renderLoaded([self, ada, bob], PAGE_LIMIT + 3);

      act(() => result.current.nextPage());
      await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(2));
      expect(usersApi.list).toHaveBeenLastCalledWith({ limit: PAGE_LIMIT, offset: PAGE_LIMIT });
      expect(result.current.offset).toBe(PAGE_LIMIT);

      act(() => result.current.prevPage());
      await waitFor(() => expect(usersApi.list).toHaveBeenCalledTimes(3));
      expect(result.current.offset).toBe(0);
    });

    it("stays on the last page and on the first page at the bounds", async () => {
      const { result } = await renderLoaded([self, ada, bob]);

      act(() => result.current.nextPage());
      act(() => result.current.prevPage());

      expect(result.current.offset).toBe(0);
      expect(usersApi.list).toHaveBeenCalledTimes(1);
    });
  });

  // ── role catalog ──────────────────────────────────────────────────────────

  describe("role catalog", () => {
    it("starts from the role table and takes the backend's catalog, highest role first", async () => {
      vi.mocked(usersApi.roles).mockResolvedValue({
        roles: [
          { role: "Guest", priority: 0, usageLimits: ada.usageLimits },
          { role: "SuperAdministrator", priority: 4, usageLimits: self.usageLimits },
        ],
      });
      const { result } = await renderLoaded();

      await waitFor(() => expect(result.current.roleCatalog).toHaveLength(2));
      expect(result.current.roleCatalog.map((entry) => entry.role)).toEqual([
        "SuperAdministrator",
        "Guest",
      ]);
    });

    it("keeps the role table when the catalog cannot be read, without a toast", async () => {
      const error = new Error("down");
      vi.mocked(usersApi.roles).mockRejectedValue(error);
      const { result } = await renderLoaded();

      await waitFor(() => expect(logger.error).toHaveBeenCalledWith("useAdminUsers.roles", error));
      expect(result.current.roleCatalog.map((entry) => entry.role)).toEqual([
        "SuperAdministrator",
        "Administrator",
        "Researcher",
        "BaseUser",
        "Guest",
      ]);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  // ── setRole ───────────────────────────────────────────────────────────────

  describe("setRole", () => {
    it("replaces the row with the backend's answer and toasts the new role", async () => {
      const { result } = await renderLoaded();
      const promoted = {
        ...ada,
        roles: ["Guest", "Researcher"] as const,
        effectiveRole: "Researcher" as const,
      };
      vi.mocked(usersApi.setRole).mockResolvedValue({ ...promoted, roles: [...promoted.roles] });

      await act(() => result.current.setRole(ada.uid, "Researcher"));

      expect(usersApi.setRole).toHaveBeenCalledWith(ada.uid, "Researcher");
      expect(result.current.users.find((user) => user.uid === ada.uid)?.effectiveRole).toBe(
        "Researcher",
      );
      expect(toast.success).toHaveBeenCalledWith(
        'adminUsers.roleUpdated:{"name":"Ada","role":"roles.Researcher"}',
      );
      expect(result.current.mutatingUid).toBeNull();
    });

    it("marks the row as mutating while the request is in flight", async () => {
      const { result } = await renderLoaded();
      let resolve: (user: AdminUser) => void = () => {};
      vi.mocked(usersApi.setRole).mockReturnValue(
        new Promise<AdminUser>((res) => {
          resolve = res;
        }),
      );

      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.setRole(ada.uid, "BaseUser");
      });
      expect(result.current.mutatingUid).toBe(ada.uid);

      await act(async () => {
        resolve({ ...ada, effectiveRole: "BaseUser" });
        await pending;
      });
      expect(result.current.mutatingUid).toBeNull();
    });

    it("toasts the forbidden message on a 403 and keeps the row", async () => {
      const { result } = await renderLoaded();
      const error = backendError(403, "forbidden");
      vi.mocked(usersApi.setRole).mockRejectedValue(error);

      await act(() => result.current.setRole(ada.uid, "Administrator"));

      expect(logger.error).toHaveBeenCalledWith("useAdminUsers.mutate", error);
      expect(toast.error).toHaveBeenCalledWith("adminUsers.errorForbidden");
      expect(result.current.users.find((user) => user.uid === ada.uid)?.effectiveRole).toBe(
        "Guest",
      );
      expect(result.current.mutatingUid).toBeNull();
    });

    it("toasts the not-found message on a 404 and the generic one otherwise", async () => {
      const { result } = await renderLoaded();

      vi.mocked(usersApi.setRole).mockRejectedValue(backendError(404, "not_found"));
      await act(() => result.current.setRole("gone", "Guest"));
      expect(toast.error).toHaveBeenLastCalledWith("adminUsers.errorNotFound");

      vi.mocked(usersApi.setRole).mockRejectedValue(new Error("Network Error"));
      await act(() => result.current.setRole(ada.uid, "Guest"));
      expect(toast.error).toHaveBeenLastCalledWith("adminUsers.errorSetRole");
    });
  });

  // ── deactivate / reactivate ───────────────────────────────────────────────

  describe("deactivate / reactivate", () => {
    it("deactivates a user in place", async () => {
      const { result } = await renderLoaded();
      vi.mocked(usersApi.deactivate).mockResolvedValue({ ...bob, deactivated: true });

      await act(() => result.current.deactivate(bob.uid));

      expect(usersApi.deactivate).toHaveBeenCalledWith(bob.uid);
      expect(result.current.users.find((user) => user.uid === bob.uid)?.deactivated).toBe(true);
      expect(toast.success).toHaveBeenCalledWith('adminUsers.deactivated:{"name":"Bob"}');
    });

    it("reactivates a user in place", async () => {
      const { result } = await renderLoaded([self, { ...bob, deactivated: true }]);
      vi.mocked(usersApi.reactivate).mockResolvedValue({ ...bob, deactivated: false });

      await act(() => result.current.reactivate(bob.uid));

      expect(usersApi.reactivate).toHaveBeenCalledWith(bob.uid);
      expect(result.current.users.find((user) => user.uid === bob.uid)?.deactivated).toBe(false);
      expect(toast.success).toHaveBeenCalledWith('adminUsers.reactivated:{"name":"Bob"}');
    });

    it("toasts the specific error when the request fails", async () => {
      const { result } = await renderLoaded();
      vi.mocked(usersApi.deactivate).mockRejectedValue(new Error("boom"));
      vi.mocked(usersApi.reactivate).mockRejectedValue(new Error("boom"));

      await act(() => result.current.deactivate(bob.uid));
      expect(toast.error).toHaveBeenLastCalledWith("adminUsers.errorDeactivate");

      await act(() => result.current.reactivate(bob.uid));
      expect(toast.error).toHaveBeenLastCalledWith("adminUsers.errorReactivate");
    });
  });

  // ── confirmation flow ─────────────────────────────────────────────────────

  describe("pending action", () => {
    it("holds a role change until it is confirmed, then runs it", async () => {
      const { result } = await renderLoaded();
      vi.mocked(usersApi.setRole).mockResolvedValue({ ...ada, effectiveRole: "Researcher" });

      act(() => result.current.requestRoleChange(ada, "Researcher"));
      expect(result.current.pendingAction).toEqual({ kind: "role", user: ada, role: "Researcher" });
      expect(usersApi.setRole).not.toHaveBeenCalled();

      await act(() => result.current.confirmAction());

      expect(result.current.pendingAction).toBeNull();
      expect(usersApi.setRole).toHaveBeenCalledWith(ada.uid, "Researcher");
    });

    it("ignores a role change to the role the user already has", async () => {
      const { result } = await renderLoaded();

      act(() => result.current.requestRoleChange(bob, "Researcher"));

      expect(result.current.pendingAction).toBeNull();
    });

    it("dismiss drops the pending action without calling the backend", async () => {
      const { result } = await renderLoaded();

      act(() => result.current.requestDeactivate(bob));
      expect(result.current.pendingAction).toEqual({ kind: "deactivate", user: bob });
      act(() => result.current.dismissAction());

      expect(result.current.pendingAction).toBeNull();
      await act(() => result.current.confirmAction());
      expect(usersApi.deactivate).not.toHaveBeenCalled();
    });

    it("confirms a deactivation and a reactivation", async () => {
      const { result } = await renderLoaded();
      vi.mocked(usersApi.deactivate).mockResolvedValue({ ...bob, deactivated: true });
      vi.mocked(usersApi.reactivate).mockResolvedValue({ ...bob, deactivated: false });

      act(() => result.current.requestDeactivate(bob));
      await act(() => result.current.confirmAction());
      expect(usersApi.deactivate).toHaveBeenCalledWith(bob.uid);

      act(() => result.current.requestReactivate(bob));
      await act(() => result.current.confirmAction());
      expect(usersApi.reactivate).toHaveBeenCalledWith(bob.uid);
    });
  });
});
