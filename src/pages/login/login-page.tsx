import { motion, type Variants } from "motion/react";
import { Link, Navigate } from "react-router-dom";
import { useAuthStore } from "@/entities/user";
import { AuthLayout, LoginButton } from "@/features/auth/login";
import { LanguageSwitcher } from "@/features/language-switch";
import avispaLogo from "@/shared/assets/logos/AVISPA.jpg";
import javerianaLogo from "@/shared/assets/logos/javeriana.png";
import promuevaSrc from "@/shared/assets/logos/promueva.svg";
import univalleLogo from "@/shared/assets/logos/univalle.svg";
import { useTranslation } from "@/shared/i18n";
import { Logo } from "@/shared/ui/logo";

/** Stagger container — each child animates in sequence */
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

/** Shared fade + slide-up for each item */
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function LoginPage() {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const { t } = useTranslation();

  if (loading) return null;
  if (user) return <Navigate to="/home" replace />;

  return (
    <AuthLayout>
      <motion.div
        className="flex flex-col items-center min-h-screen py-10"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="self-end mb-4">
          <LanguageSwitcher />
        </motion.div>

        <div className="flex flex-col items-center justify-center flex-1 w-full">
          <motion.div variants={item}>
            <Link to="/" aria-label="Home">
              <Logo className="h-48 w-auto" />
            </Link>
          </motion.div>

          <motion.p
            variants={item}
            className="mt-8 text-xs font-medium tracking-widest uppercase text-muted-foreground"
          >
            {t("auth.loginPage")}
          </motion.p>

          <motion.h1
            variants={item}
            className="mt-2 font-display text-2xl font-normal text-foreground text-center leading-snug"
          >
            {t("auth.welcome")}
          </motion.h1>

          <motion.div variants={item} className="mt-10 w-full flex justify-center">
            <LoginButton />
          </motion.div>

          <motion.div variants={item}>
            <Link
              to="/home"
              className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              {t("auth.continueWithout")}
            </Link>
          </motion.div>
        </div>

        <motion.div variants={item} className="flex items-center gap-5 mt-8 mb-4">
          <img
            src={univalleLogo}
            alt="Universidad del Valle"
            className="h-6 w-auto opacity-60 dark:brightness-0 dark:invert dark:opacity-40"
          />
          <span className="text-border">·</span>
          <img
            src={promuevaSrc}
            alt="PROMUEVA"
            className="h-5 w-auto opacity-60 dark:brightness-0 dark:invert dark:opacity-40"
          />
          <span className="text-border">·</span>
          <img
            src={avispaLogo}
            alt="AVISPA"
            className="h-5 w-auto opacity-70 dark:brightness-0 dark:invert dark:opacity-40"
          />
          <span className="text-border">·</span>
          <img
            src={javerianaLogo}
            alt="Pontificia Universidad Javeriana"
            className="h-5 w-auto rounded-sm opacity-80 dark:opacity-50"
          />
        </motion.div>
      </motion.div>
    </AuthLayout>
  );
}
