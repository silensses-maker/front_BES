import { useTranslation } from "@/shared/i18n";
import { roleLabel } from "@/shared/i18n/enum-labels";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { adminUserDisplayName } from "../lib/admin-users.lib";
import type { PendingUserAction } from "../model/use-admin-users";

interface ConfirmUserActionDialogProps {
  action: PendingUserAction | null;
  onDismiss: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation of a role change, a deactivation or a reactivation (the shell's single dialog
 * pattern). Granting SuperAdministrator carries an extra warning: that user will manage every
 * role, the caller's included.
 */
export function ConfirmUserActionDialog({
  action,
  onDismiss,
  onConfirm,
}: ConfirmUserActionDialogProps) {
  const { t } = useTranslation();
  const name = action ? adminUserDisplayName(action.user) : "";

  let title = "";
  let body = "";
  let confirmLabel = "";
  let destructive = false;
  let superAdminWarning = false;
  if (action?.kind === "role") {
    title = t("adminUsers.confirmRoleTitle");
    body = t("adminUsers.confirmRoleBody", { name, role: roleLabel(t, action.role) });
    confirmLabel = t("adminUsers.confirmRoleAction");
    superAdminWarning = action.role === "SuperAdministrator";
  } else if (action?.kind === "deactivate") {
    title = t("adminUsers.confirmDeactivateTitle");
    body = t("adminUsers.confirmDeactivateBody", { name });
    confirmLabel = t("adminUsers.deactivate");
    destructive = true;
  } else if (action?.kind === "reactivate") {
    title = t("adminUsers.confirmReactivateTitle");
    body = t("adminUsers.confirmReactivateBody", { name });
    confirmLabel = t("adminUsers.reactivate");
  }

  return (
    <Dialog open={action !== null} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {superAdminWarning && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
          >
            {t("adminUsers.confirmGrantSuperAdmin")}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDismiss}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
