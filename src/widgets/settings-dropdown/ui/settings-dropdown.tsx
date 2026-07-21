import { LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/entities/user";
import { useLogout } from "@/features/auth/logout";
import { type Lang, useLanguageSwitch } from "@/features/language-switch";
import { useTranslation } from "@/shared/i18n";
import { useProfileSheetStore } from "@/shared/model/profile-sheet.store";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type Theme = "light" | "dark" | "system";

const THEME_OPTIONS: { value: Theme; labelKey: string; icon: React.ReactNode }[] = [
  { value: "light", labelKey: "dashboard.themeLight", icon: <Sun className="h-4 w-4" /> },
  { value: "dark", labelKey: "dashboard.themeDark", icon: <Moon className="h-4 w-4" /> },
  {
    value: "system",
    labelKey: "dashboard.themeSystem",
    icon: <Monitor className="h-4 w-4" />,
  },
];

const LANG_OPTIONS: { value: Lang; labelKey: string }[] = [
  { value: "en", labelKey: "nav.en" },
  { value: "es", labelKey: "nav.es" },
];

export function SettingsDropdown() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { currentLang, changeLanguage } = useLanguageSwitch();
  const user = useAuthStore((state) => state.user);
  const { logout } = useLogout();
  const openProfileSheet = useProfileSheetStore((s) => s.open);

  const displayName = user?.name || t("dashboard.guestName");
  const email = user?.email || t("dashboard.guestEmail");
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={t("dashboard.userMenuTrigger")}
      >
        <Avatar className="h-8 w-8">
          {user?.photo && <AvatarImage src={user.photo} alt={displayName} />}
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* User identity */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-none">{displayName}</span>
            <span className="text-xs leading-none text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Navigation — only when logged in */}
        {user && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                onClick={openProfileSheet}
              >
                <User className="h-4 w-4" />
                <span>{t("dashboard.profile")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
          </>
        )}

        {/* Language selector */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1">
            {t("nav.language")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={currentLang}
            onValueChange={(value) => changeLanguage(value as Lang)}
          >
            {LANG_OPTIONS.map(({ value, labelKey }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {t(labelKey)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Theme selector */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1">
            {t("dashboard.theme")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme ?? "system"}
            onValueChange={(value) => setTheme(value as Theme)}
          >
            {THEME_OPTIONS.map(({ value, labelKey, icon }) => (
              <DropdownMenuRadioItem key={value} value={value} className="flex items-center gap-2">
                {icon}
                <span>{t(labelKey)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        {/* Sign out — only when logged in */}
        {user && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
              onClick={logout}
            >
              <LogOut className="h-4 w-4" />
              <span>{t("auth.signOut")}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
