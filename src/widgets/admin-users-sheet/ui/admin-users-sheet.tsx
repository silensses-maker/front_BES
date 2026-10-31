import { lazy, Suspense } from "react";
import { isSuperAdmin, useAuthStore } from "@/entities/user";
import { useTranslation } from "@/shared/i18n";
import { useAdminUsersSheetStore } from "@/shared/model/admin-users-sheet.store";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";

// The administration feature (table, dialogs, API calls) is its own chunk: it loads the first
// time a super administrator opens the sheet, never for everybody else.
const AdminUsersPanel = lazy(() =>
  import(/* webpackChunkName: "admin-users" */ "@/features/admin-users").then((m) => ({
    default: m.AdminUsersPanel,
  })),
);

/**
 * User administration as a right-side sheet, the same shell pattern as the profile sheet:
 * opened from the settings dropdown (super administrators only), closed with Escape, the
 * overlay or the close button. The panel mounts only while the sheet is open, so every opening
 * fetches a fresh page of users.
 */
export function AdminUsersSheet() {
  const { t } = useTranslation();
  const isOpen = useAdminUsersSheetStore((s) => s.isOpen);
  const close = useAdminUsersSheetStore((s) => s.close);
  const user = useAuthStore((s) => s.user);
  // Belt and braces: the dropdown only offers the item to super administrators.
  const open = isOpen && user !== null && isSuperAdmin(user.roles);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-5xl"
      >
        <SheetHeader className="pb-2">
          <SheetTitle>{t("adminUsers.title")}</SheetTitle>
          <SheetDescription>{t("adminUsers.description")}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {open && (
            <Suspense
              fallback={
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("adminUsers.loading")}
                </p>
              }
            >
              <AdminUsersPanel showHeader={false} />
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
