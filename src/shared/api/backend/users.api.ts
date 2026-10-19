import "./auth-interceptor";
import { backendClient } from "./client";
import type {
  DeactivateResponse,
  RoleActionResponse,
  UserInfoResponse,
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
   * the account with 401 "Account is deactivated"; only an administrator can reactivate it.
   */
  async deactivateMe(): Promise<DeactivateResponse> {
    const { data } = await backendClient.post<DeactivateResponse>("/api/users/me/deactivate");
    return data;
  },

  async addRole(uid: string, role: UserRole): Promise<RoleActionResponse> {
    const { data } = await backendClient.put<RoleActionResponse>(`/api/users/role/${uid}/${role}`);
    return data;
  },
};
