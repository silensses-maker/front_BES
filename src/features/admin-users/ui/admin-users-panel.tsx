import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useAdminUsers } from "../model/use-admin-users";
import { ConfirmUserActionDialog } from "./confirm-user-action-dialog";
import { RoleLegend } from "./role-legend";
import { UsersTable } from "./users-table";

/**
 * User administration (SuperAdministrator only): search, one page of users with their role,
 * quotas and status, the confirm dialog of every change, and the legend of roles and quotas.
 */
interface AdminUsersPanelProps {
  /** False when a host (the sheet) already shows the title and description. */
  showHeader?: boolean;
}

export function AdminUsersPanel({ showHeader = true }: AdminUsersPanelProps) {
  const { t } = useTranslation();
  const {
    users,
    total,
    limit,
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
    requestRoleChange,
    requestDeactivate,
    requestReactivate,
    dismissAction,
    confirmAction,
  } = useAdminUsers();

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + users.length, total);

  return (
    <div className="flex flex-col gap-6">
      {showHeader && (
        <header className="flex flex-col gap-1">
          <h1 className="font-sans text-2xl font-semibold text-foreground">
            {t("adminUsers.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("adminUsers.description")}</p>
        </header>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder={t("adminUsers.searchPlaceholder")}
            aria-label={t("adminUsers.searchPlaceholder")}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {t("adminUsers.pageSummary", { from, to, total })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={loading || offset === 0}
            onClick={prevPage}
            aria-label={t("adminUsers.prevPage")}
            title={t("adminUsers.prevPage")}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={loading || offset + limit >= total}
            onClick={nextPage}
            aria-label={t("adminUsers.nextPage")}
            title={t("adminUsers.nextPage")}
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={loading}
            onClick={() => void refresh()}
            aria-label={t("adminUsers.refresh")}
            title={t("adminUsers.refresh")}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        </div>
      </div>

      <UsersTable
        users={users}
        loading={loading}
        query={query}
        mutatingUid={mutatingUid}
        currentUid={currentUid}
        catalog={roleCatalog}
        onRequestRoleChange={requestRoleChange}
        onRequestDeactivate={requestDeactivate}
        onRequestReactivate={requestReactivate}
      />

      <RoleLegend catalog={roleCatalog} />

      <ConfirmUserActionDialog
        action={pendingAction}
        onDismiss={dismissAction}
        onConfirm={() => void confirmAction()}
      />
    </div>
  );
}
