import "./auth-interceptor";
import { backendClient } from "./client";
import type { RoleActionResponse, UserRole, UserSyncResponse } from "./types/backend.types";

export const usersApi = {
  async sync(): Promise<UserSyncResponse> {
    const { data } = await backendClient.post<UserSyncResponse>("/api/users/sync");
    return data;
  },

  async getInfo(uid: string): Promise<UserSyncResponse> {
    const { data } = await backendClient.get<UserSyncResponse>(`/api/users/info/${uid}`);
    return data;
  },

  async addRole(uid: string, role: UserRole): Promise<RoleActionResponse> {
    const { data } = await backendClient.put<RoleActionResponse>(`/api/users/role/${uid}/${role}`);
    return data;
  },
};
