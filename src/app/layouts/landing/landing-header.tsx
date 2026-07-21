import { Menu, X } from "lucide-react";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { Logo } from "@/shared/ui/logo";
import { SettingsDropdown } from "@/widgets/settings-dropdown";

const NAV_LINKS = [
  { to: "/wiki", labelKey: "nav.wiki" },
  { to: "/results", labelKey: "nav.previousResults" },
  { to: "/board", labelKey: "nav.board" },
] as const;

export function LandingHeader() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
        <NavLink to="/" aria-label="SiLEnSeSS">
          <Logo className="h-8 w-8" />
        </NavLink>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(({ to, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors hover:text-foreground/80 ${
                  isActive ? "text-foreground" : "text-foreground/60"
                }`
              }
            >
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SettingsDropdown />

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="md:hidden rounded-md p-2 text-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
            aria-label={mobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border/40 bg-background px-4 py-3 flex flex-col gap-1">
          {NAV_LINKS.map(({ to, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
                  isActive ? "bg-accent text-accent-foreground" : "text-foreground/70"
                }`
              }
            >
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
