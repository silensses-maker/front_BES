import "./auth-interceptor";
import { backendClient } from "./client";
import type {
  AdminUser,
  DeactivateResponse,
  RoleActionResponse,
  RoleCatalogResponse,
  SetRoleRequest,
  UserInfoResponse,
  UserListParams,
  UserListResponse,
  UserRole,
  UserSyncResponse,
} from "./types/backend.types";

export const usersApi = {
  async sync(): Promise<UserSyncResponse> {
    const { data } = await backendClient.post<UserSyncResponse>("/api/users/sync");
    return data;
  },

  /** Owner or admin only. `timeout` (ms) bounds the request; omitted, the client has none. */
  async getInfo(uid: string, options?: { timeout?: number }): Promise<UserInfoResponse> {
    const { data } = await backendClient.get<UserInfoResponse>(`/api/users/info/${uid}`, options);
    return data;
  },

  /**
   * Deactivates the caller's own account. From then on the backend answers every REST call of
   * the account with 401 "Account is deactivated"; only a super administrator can reactivate it.
   */
  async deactivateMe(): Promise<DeactivateResponse> {
    const { data } = await backendClient.post<DeactivateResponse>("/api/users/me/deactivate");
    return data;
  },

  /**
   * Adds one role to a user without removing the others (SuperAdministrator only). Superseded by
   * `setRole`, which replaces the role set; kept for scripts that still call the path form.
   */
  async addRole(uid: string, role: UserRole): Promise<RoleActionResponse> {
    const { data } = await backendClient.put<RoleActionResponse>(`/api/users/role/${uid}/${role}`);
    return data;
  },

  // ── SuperAdministrator: user administration ────────────────────────────────

  /** Pages the users (newest first); `q` filters by email or name. SuperAdministrator only. */
  async list(params: UserListParams = {}): Promise<UserListResponse> {
    const { data } = await backendClient.get<UserListResponse>("/api/users", { params });
    return data;
  },

  /** The role catalog with the quotas each role grants, by priority desc. Any user. */
  async roles(): Promise<RoleCatalogResponse> {
    const { data } = await backendClient.get<RoleCatalogResponse>("/api/users/roles");
    return data;
  },

  /**
   * Replaces a user's roles with {Guest, role} (SuperAdministrator only). 403 `forbidden` on the
   * caller's own uid, 404 `not_found` for an unknown uid, 400 `invalid_body` for an unknown role.
   */
  async setRole(uid: string, role: UserRole): Promise<AdminUser> {
    const body: SetRoleRequest = { role };
    const { data } = await backendClient.put<AdminUser>(`/api/users/${uid}/role`, body);
    return data;
  },

  /** Deactivates another user's account (SuperAdministrator only; 403 on the caller's own uid). */
  async deactivate(uid: string): Promise<AdminUser> {
    const { data } = await backendClient.post<AdminUser>(`/api/users/${uid}/deactivate`);
    return data;
  },

  /** Reactivates a deactivated account (SuperAdministrator only). */
  async reactivate(uid: string): Promise<AdminUser> {
    const { data } = await backendClient.post<AdminUser>(`/api/users/${uid}/reactivate`);
    return data;
  },
};
