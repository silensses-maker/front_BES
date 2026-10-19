import { motion, type Variants } from "motion/react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/entities/user";
import { PARTNERS } from "@/shared/config/partners";
import { Trans, useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function HomePage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);

  return (
    <article className="flex flex-col gap-16">
      {/* Hero — staggered */}
      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6"
      >
        <motion.h1
          variants={item}
          className="font-display text-5xl font-normal tracking-tight text-foreground sm:text-6xl"
        >
          {t("home.headline")}
        </motion.h1>

        <motion.p
          variants={item}
          className="max-w-2xl text-lg leading-relaxed text-muted-foreground"
        >
          {t("home.subheadline")}
        </motion.p>

        {!user && (
          <motion.div variants={item}>
            <Link to="/">
              <Button size="lg">{t("home.cta")}</Button>
            </Link>
          </motion.div>
        )}

        <motion.div variants={item} className="flex flex-col gap-6 pt-8">
          <p className="text-sm font-medium text-muted-foreground">{t("home.participation")}</p>
          <div className="flex flex-wrap items-center gap-4">
            {PARTNERS.map(({ id, src, alt, href }) => (
              <a
                key={id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center rounded-md px-3 py-2 transition-opacity opacity-70 hover:opacity-100 dark:bg-white"
              >
                <img src={src} alt={alt} className="h-8 w-auto" />
              </a>
            ))}
          </div>
        </motion.div>
      </motion.section>

      {/* Introduction */}
      <section className="flex flex-col gap-4 max-w-prose">
        <h2 className="font-display text-2xl font-normal text-foreground">
          {t("home.introTitle")}
        </h2>
        <p className="text-muted-foreground leading-relaxed">{t("home.introP1")}</p>
        <p className="text-muted-foreground leading-relaxed">
          <Trans t={t} i18nKey="home.introP2" components={{ bold: <strong /> }} />
        </p>
      </section>

      {/* Examples */}
      <section className="flex flex-col gap-6 max-w-prose">
        <h2 className="font-display text-2xl font-normal text-foreground">
          {t("home.examplesTitle")}
        </h2>
        <p className="text-muted-foreground leading-relaxed">{t("home.examplesIntro")}</p>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="font-sans font-semibold text-foreground">
              {t("home.exampleConsensusTitle")}
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              {t("home.exampleConsensusBody")}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-sans font-semibold text-foreground">
              {t("home.exampleSilenceTitle")}
            </h3>
            <p className="text-muted-foreground leading-relaxed">{t("home.exampleSilenceBody")}</p>
          </div>
        </div>
      </section>
    </article>
  );
}
