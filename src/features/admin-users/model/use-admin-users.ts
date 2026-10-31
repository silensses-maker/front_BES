import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/entities/user";
import {
  type AdminUser,
  type RoleCatalogEntry,
  type UserRole,
  usersApi,
} from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { roleLabel } from "@/shared/i18n/enum-labels";
import { isErrorCode } from "@/shared/lib/backend-error";
import { logger } from "@/shared/lib/logger";
import { adminUserDisplayName, fallbackRoleCatalog, sortRoleCatalog } from "../lib/admin-users.lib";

export const PAGE_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

/** An action the panel asked to confirm before it runs. */
export type PendingUserAction =
  | { kind: "role"; user: AdminUser; role: UserRole }
  | { kind: "deactivate"; user: AdminUser }
  | { kind: "reactivate"; user: AdminUser };

export interface UseAdminUsersReturn {
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
  /** The search box's text; the request goes out `SEARCH_DEBOUNCE_MS` after the last change. */
  query: string;
  loading: boolean;
  /** uid of the row whose role or status is being changed, if any. */
  mutatingUid: string | null;
  /** The signed-in super administrator's own uid (that row cannot be edited). */
  currentUid: string | null;
  /** The role catalog by priority desc (the backend's, or the role table while it cannot be read). */
  roleCatalog: RoleCatalogEntry[];
  pendingAction: PendingUserAction | null;
  search: (query: string) => void;
  nextPage: () => void;
  prevPage: () => void;
  refresh: () => Promise<void>;
  setRole: (uid: string, role: UserRole) => Promise<void>;
  deactivate: (uid: string) => Promise<void>;
  reactivate: (uid: string) => Promise<void>;
  requestRoleChange: (user: AdminUser, role: UserRole) => void;
  requestDeactivate: (user: AdminUser) => void;
  requestReactivate: (user: AdminUser) => void;
  dismissAction: () => void;
  confirmAction: () => Promise<void>;
}

/**
 * User administration (SuperAdministrator only): one page of users with search, and the three
 * mutations (role, deactivate, reactivate), each confirmed by the panel through `pendingAction`
 * before it runs. A mutation's answer replaces the row in place, so the list never reloads for
 * one change; `refresh` re-reads the current page.
 */
export function useAdminUsers(): UseAdminUsersReturn {
  const { t } = useTranslation();
  const currentUid = useAuthStore((state) => state.user?.uid ?? null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [mutatingUid, setMutatingUid] = useState<string | null>(null);
  const [roleCatalog, setRoleCatalog] = useState<RoleCatalogEntry[]>(fallbackRoleCatalog);
  const [pendingAction, setPendingAction] = useState<PendingUserAction | null>(null);
  // Only the latest request may touch the list: a slow page must not overwrite a newer search.
  const requestSeq = useRef(0);
  // `t` is read through a ref so the page request never depends on its identity: an unstable `t`
  // (a test's, or a provider re-creating it) must not re-run the load effect on every render.
  const tRef = useRef(t);
  tRef.current = t;

  const load = useCallback(async (q: string, pageOffset: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const response = await usersApi.list({
        limit: PAGE_LIMIT,
        offset: pageOffset,
        ...(q === "" ? {} : { q }),
      });
      if (seq !== requestSeq.current) return;
      setUsers(response.users);
      setTotal(response.total);
    } catch (error) {
      if (seq !== requestSeq.current) return;
      logger.error("useAdminUsers.load", error);
      toast.error(
        isErrorCode(error, "forbidden")
          ? tRef.current("adminUsers.errorForbidden")
          : tRef.current("adminUsers.errorLoad"),
      );
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  // Search debounce: the trimmed text reaches the request after a pause, from the first page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load(debouncedQuery, offset);
  }, [load, debouncedQuery, offset]);

  // The catalog is a legend: when it cannot be read the role table stands in, without a toast.
  useEffect(() => {
    let cancelled = false;
    usersApi
      .roles()
      .then(({ roles }) => {
        if (!cancelled && roles.length > 0) setRoleCatalog(sortRoleCatalog(roles));
      })
      .catch((error: unknown) => {
        if (!cancelled) logger.error("useAdminUsers.roles", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback((text: string) => setQuery(text), []);

  const nextPage = useCallback(() => {
    setOffset((prev) => (prev + PAGE_LIMIT < total ? prev + PAGE_LIMIT : prev));
  }, [total]);

  const prevPage = useCallback(() => {
    setOffset((prev) => Math.max(0, prev - PAGE_LIMIT));
  }, []);

  const refresh = useCallback(() => load(debouncedQuery, offset), [load, debouncedQuery, offset]);

  /** Runs one mutation of a row and replaces that row with the backend's answer. */
  const mutate = useCallback(
    async (
      uid: string,
      action: () => Promise<AdminUser>,
      successMessage: (updated: AdminUser) => string,
      errorKey:
        | "adminUsers.errorSetRole"
        | "adminUsers.errorDeactivate"
        | "adminUsers.errorReactivate",
    ) => {
      setMutatingUid(uid);
      try {
        const updated = await action();
        setUsers((prev) => prev.map((user) => (user.uid === updated.uid ? updated : user)));
        toast.success(successMessage(updated));
      } catch (error) {
        logger.error("useAdminUsers.mutate", error);
        if (isErrorCode(error, "forbidden")) toast.error(t("adminUsers.errorForbidden"));
        else if (isErrorCode(error, "not_found")) toast.error(t("adminUsers.errorNotFound"));
        else toast.error(t(errorKey));
      } finally {
        setMutatingUid(null);
      }
    },
    [t],
  );

  const setRole = useCallback(
    (uid: string, role: UserRole) =>
      mutate(
        uid,
        () => usersApi.setRole(uid, role),
        (updated) =>
          t("adminUsers.roleUpdated", {
            name: adminUserDisplayName(updated),
            role: roleLabel(t, updated.effectiveRole),
          }),
        "adminUsers.errorSetRole",
      ),
    [mutate, t],
  );

  const deactivate = useCallback(
    (uid: string) =>
      mutate(
        uid,
        () => usersApi.deactivate(uid),
        (updated) => t("adminUsers.deactivated", { name: adminUserDisplayName(updated) }),
        "adminUsers.errorDeactivate",
      ),
    [mutate, t],
  );

  const reactivate = useCallback(
    (uid: string) =>
      mutate(
        uid,
        () => usersApi.reactivate(uid),
        (updated) => t("adminUsers.reactivated", { name: adminUserDisplayName(updated) }),
        "adminUsers.errorReactivate",
      ),
    [mutate, t],
  );

  const requestRoleChange = useCallback((user: AdminUser, role: UserRole) => {
    if (role === user.effectiveRole) return;
    setPendingAction({ kind: "role", user, role });
  }, []);

  const requestDeactivate = useCallback((user: AdminUser) => {
    setPendingAction({ kind: "deactivate", user });
  }, []);

  const requestReactivate = useCallback((user: AdminUser) => {
    setPendingAction({ kind: "reactivate", user });
  }, []);

  const dismissAction = useCallback(() => setPendingAction(null), []);

  const confirmAction = useCallback(async () => {
    const action = pendingAction;
    if (action === null) return;
    setPendingAction(null);
    switch (action.kind) {
      case "role":
        await setRole(action.user.uid, action.role);
        break;
      case "deactivate":
        await deactivate(action.user.uid);
        break;
      case "reactivate":
        await reactivate(action.user.uid);
        break;
    }
  }, [pendingAction, setRole, deactivate, reactivate]);

  return {
    users,
    total,
    limit: PAGE_LIMIT,
    offset,
    query,
    loading,
    mutatingUid,
    currentUid,
    roleCatalog,
    pendingAction,
    search,
    nextPage,
    prevPage,
    refresh,
    setRole,
    deactivate,
    reactivate,
    requestRoleChange,
    requestDeactivate,
    requestReactivate,
    dismissAction,
    confirmAction,
  };
}
