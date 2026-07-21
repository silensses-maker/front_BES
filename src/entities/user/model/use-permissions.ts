import { useMemo } from "react";
import { getRoleLimits, getRolePermissions } from "../lib/permissions";
import { useAuthStore } from "./user.store";

export function usePermissions() {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  const roles = user?.roles ?? ["Guest"];

  const limits = useMemo(() => getRoleLimits(roles), [roles]);
  const permissions = useMemo(() => getRolePermissions(roles), [roles]);

  const hasPermission = (permission: string): boolean => permissions.includes(permission);

  return { roles, limits, permissions, hasPermission, loading };
}
