import { NavLink } from "react-router-dom";
import avispaLogo from "@/shared/assets/logos/AVISPA.jpg";
import javerianaLogo from "@/shared/assets/logos/javeriana.png";
import promuevaSvg from "@/shared/assets/logos/promueva.svg";
import univalleSvg from "@/shared/assets/logos/univalle.svg";
import { useTranslation } from "@/shared/i18n";
import { Logo } from "@/shared/ui/logo";

const NAV_LINKS = [
  { to: "/home", labelKey: "home" },
  { to: "/wiki", labelKey: "wiki" },
  { to: "/results", labelKey: "previousResults" },
] as const;

const MORE_LINKS = [
  { to: "/faq", labelKey: "faq" },
  { to: "/contact", labelKey: "contact" },
  { to: "/about", labelKey: "about" },
] as const;

export function LandingFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="container mx-auto px-4 md:px-8 lg:px-16 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
          {/* Brand column */}
          <div className="flex flex-col gap-4">
            <NavLink to="/home" aria-label="SiLEnSeSS">
              <Logo className="h-8 w-8" />
            </NavLink>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {t("footer.description")}
            </p>
          </div>

          {/* Navigation column */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
              {t("footer.navigation")}
            </p>
            <ul className="flex flex-col gap-2">
              {NAV_LINKS.map(({ to, labelKey }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t(`nav.${labelKey}`)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          {/* More column */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground/50">
              {t("footer.more")}
            </p>
            <ul className="flex flex-col gap-2">
              {MORE_LINKS.map(({ to, labelKey }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t(`footer.${labelKey}`)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-border/40 pt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {year} PROMUEVA — Universidad del Valle. {t("footer.rights")}
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://www.univalle.edu.co/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center rounded-md px-2 py-1 opacity-70 transition-opacity hover:opacity-100 dark:bg-white"
            >
              <img src={univalleSvg} alt="Universidad del Valle" className="h-6 w-auto" />
            </a>
            <a
              href="https://sites.google.com/view/promueva/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center rounded-md px-2 py-1 opacity-70 transition-opacity hover:opacity-100 dark:bg-white"
            >
              <img src={promuevaSvg} alt="PROMUEVA" className="h-6 w-auto" />
            </a>
            <a
              href="https://www.javerianacali.edu.co/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center rounded-md px-2 py-1 opacity-70 transition-opacity hover:opacity-100 dark:bg-white"
            >
              <img
                src={javerianaLogo}
                alt="Pontificia Universidad Javeriana"
                className="h-6 w-auto"
              />
            </a>
            <a
              href="https://eisc.univalle.edu.co/index.php/grupos-investigacion/avispa"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center rounded-md px-2 py-1 opacity-70 transition-opacity hover:opacity-100 dark:bg-white"
            >
              <img src={avispaLogo} alt="AVISPA" className="h-6 w-auto" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
