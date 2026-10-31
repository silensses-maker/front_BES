import type { AdminUser, RoleCatalogEntry, UserRole } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { adminUserDisplayName, adminUserInitials, numberLocale } from "../lib/admin-users.lib";
import { QuotaSummary } from "./quota-summary";
import { RoleSelect } from "./role-select";

interface UsersTableProps {
  users: AdminUser[];
  loading: boolean;
  /** The search text the empty state mentions. */
  query: string;
  mutatingUid: string | null;
  currentUid: string | null;
  catalog: RoleCatalogEntry[];
  onRequestRoleChange: (user: AdminUser, role: UserRole) => void;
  onRequestDeactivate: (user: AdminUser) => void;
  onRequestReactivate: (user: AdminUser) => void;
}

/** One page of users (dumb, fully controlled by `useAdminUsers`). */
export function UsersTable({
  users,
  loading,
  query,
  mutatingUid,
  currentUid,
  catalog,
  onRequestRoleChange,
  onRequestDeactivate,
  onRequestReactivate,
}: UsersTableProps) {
  const { t, i18n } = useTranslation();
  const locale = numberLocale(i18n.language);
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("adminUsers.colUser")}</TableHead>
            <TableHead>{t("adminUsers.colRole")}</TableHead>
            <TableHead title={t("adminUsers.quotasHint")}>{t("adminUsers.colQuotas")}</TableHead>
            <TableHead>{t("adminUsers.colStatus")}</TableHead>
            <TableHead>{t("adminUsers.colCreated")}</TableHead>
            <TableHead className="text-right">{t("adminUsers.colActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                {loading
                  ? t("adminUsers.loading")
                  : query.trim() === ""
                    ? t("adminUsers.empty")
                    : t("adminUsers.emptySearch", { query: query.trim() })}
              </TableCell>
            </TableRow>
          )}
          {users.map((user) => {
            const isSelf = user.uid === currentUid;
            const mutating = mutatingUid === user.uid;
            const name = adminUserDisplayName(user);
            const roleSelect = (
              <RoleSelect
                value={user.effectiveRole}
                catalog={catalog}
                disabled={isSelf || mutating}
                label={t("adminUsers.roleSelectLabel", { name })}
                onChange={(role) => onRequestRoleChange(user, role)}
              />
            );
            return (
              <TableRow
                key={user.uid}
                aria-busy={mutating}
                className={mutating ? "opacity-60" : ""}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      {user.photo && <AvatarImage src={user.photo} alt="" />}
                      <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                        {adminUserInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {name}
                        {isSelf && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {t("adminUsers.you")}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {isSelf ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex" tabIndex={0}>
                          {roleSelect}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">{t("adminUsers.cannotEditSelf")}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    roleSelect
                  )}
                </TableCell>
                <TableCell>
                  <QuotaSummary limits={user.usageLimits} />
                </TableCell>
                <TableCell>
                  {user.deactivated ? (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      {t("adminUsers.statusDeactivated")}
                    </Badge>
                  ) : (
                    <Badge variant="default">{t("adminUsers.statusActive")}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
                </TableCell>
                <TableCell className="text-right">
                  {user.deactivated ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSelf || mutating}
                      onClick={() => onRequestReactivate(user)}
                    >
                      {t("adminUsers.reactivate")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isSelf || mutating}
                      title={isSelf ? t("adminUsers.cannotEditSelf") : undefined}
                      onClick={() => onRequestDeactivate(user)}
                      className="text-destructive hover:text-destructive"
                    >
                      {t("adminUsers.deactivate")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
