import { motion, type Variants } from "motion/react";
import { Fragment } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuthStore } from "@/entities/user";
import { AuthLayout, LoginButton } from "@/features/auth/login";
import { LanguageSwitcher } from "@/features/language-switch";
import { PARTNERS, type PartnerId } from "@/shared/config/partners";
import { useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
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

/**
 * Per-logo optical tweaks for the muted partner strip. Monochrome-friendly
 * marks are flattened to white in dark mode; logos whose shape depends on
 * their fill (Javeriana's crest, CNRS's white-on-navy letters) keep their colors.
 */
const PARTNER_LOGO_CLASS: Record<PartnerId, string> = {
  univalle: "h-6 opacity-60 dark:brightness-0 dark:invert dark:opacity-40",
  promueva: "h-5 opacity-60 dark:brightness-0 dark:invert dark:opacity-40",
  avispa: "h-5 opacity-70 dark:brightness-0 dark:invert dark:opacity-40",
  javeriana: "h-5 rounded-sm opacity-80 dark:opacity-50",
  cnrs: "h-6 opacity-70 dark:opacity-60",
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

        <motion.div
          variants={item}
          className="flex flex-wrap items-center justify-center gap-5 mt-8 mb-4"
        >
          {PARTNERS.map(({ id, src, alt }, index) => (
            <Fragment key={id}>
              {index > 0 && <span className="text-border">·</span>}
              <img src={src} alt={alt} className={cn("w-auto", PARTNER_LOGO_CLASS[id])} />
            </Fragment>
          ))}
        </motion.div>
      </motion.div>
    </AuthLayout>
  );
}
