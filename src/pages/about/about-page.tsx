import { ExternalLink } from "lucide-react";
import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PARTNERS, partnerHref } from "@/shared/config/partners";
import { Trans, useTranslation } from "@/shared/i18n";
import { Separator } from "@/shared/ui/separator";

/** Team page of the PROMUEVA site — linked instead of listing the members here. */
const PROMUEVA_TEAM_URL = "https://sites.google.com/view/promueva/equipo";

/** arXiv abstract of "The Sound of Silence in Social Networks" (arXiv:2410.19685). */
const ARXIV_URL = "https://arxiv.org/abs/2410.19685";

const PROMUEVA_LINE_KEYS = ["promuevaLine1", "promuevaLine2", "promuevaLine3"] as const;

const PROMUEVA_INSTITUTION_KEYS = [
  "promuevaInstitution1",
  "promuevaInstitution2",
  "promuevaInstitution3",
  "promuevaInstitution4",
  "promuevaInstitution5",
] as const;

const AVISPA_LINE_KEYS = [
  "avispaLine1",
  "avispaLine2",
  "avispaLine3",
  "avispaLine4",
  "avispaLine5",
  "avispaLine6",
  "avispaLine7",
] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const H2_CLASS = "font-display text-3xl font-normal tracking-tight text-foreground";
const H3_CLASS = "mt-2 font-display text-xl font-normal tracking-tight text-foreground";
const P_CLASS = "text-lg leading-relaxed text-muted-foreground";
const LIST_CLASS = "flex flex-col gap-2 pl-6 text-lg leading-relaxed text-muted-foreground";
const LINK_CLASS = "text-sm font-medium text-primary underline-offset-4 hover:underline";

/**
 * External link that opens in a new tab and announces it to screen readers.
 * `inline` renders an underlined link for use inside running text (no icon).
 */
function ExternalTextLink({
  href,
  inline = false,
  children,
}: {
  href: string;
  inline?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        inline
          ? "font-medium text-primary underline underline-offset-4"
          : `inline-flex items-center gap-1 ${LINK_CLASS}`
      }
    >
      {children}
      {!inline && <ExternalLink aria-hidden="true" className="size-3.5" />}
      <span className="sr-only">{t("common.opensInNewTab")}</span>
    </a>
  );
}

export function AboutPage() {
  const { t } = useTranslation();

  return (
    <article className="max-w-4xl">
      <motion.header
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6"
      >
        <motion.h1
          variants={item}
          className="font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl"
        >
          {t("about.pageTitle")}
        </motion.h1>
        <motion.p variants={item} className={P_CLASS}>
          {t("about.pageIntro")}
        </motion.p>
        <motion.p variants={item} className={P_CLASS}>
          {t("about.pageIntroUsage")}
        </motion.p>
      </motion.header>

      <Separator className="my-12" />

      <section aria-labelledby="model" className="flex flex-col gap-4">
        <h2 id="model" className={H2_CLASS}>
          {t("about.modelTitle")}
        </h2>
        <p className={P_CLASS}>{t("about.modelBody")}</p>
        <p>
          <Link to="/wiki" className={LINK_CLASS}>
            {t("about.modelLink")}
          </Link>
        </p>
      </section>

      <Separator className="my-12" />

      <section aria-labelledby="origin" className="flex flex-col gap-4">
        <h2 id="origin" className={H2_CLASS}>
          {t("about.originTitle")}
        </h2>
        <p className={P_CLASS}>{t("about.originBody")}</p>
      </section>

      <Separator className="my-12" />

      <section aria-labelledby="promueva" className="flex flex-col gap-4">
        <h2 id="promueva" className={H2_CLASS}>
          {t("about.promuevaTitle")}
        </h2>
        <p className={P_CLASS}>{t("about.promuevaIntro")}</p>
        <p className={P_CLASS}>{t("about.promuevaObjective")}</p>
        <h3 className={H3_CLASS}>{t("about.promuevaLinesTitle")}</h3>
        <ol className={`list-decimal ${LIST_CLASS}`}>
          {PROMUEVA_LINE_KEYS.map((key) => (
            <li key={key}>{t(`about.${key}`)}</li>
          ))}
        </ol>
        <h3 className={H3_CLASS}>{t("about.promuevaInstitutionsTitle")}</h3>
        <ul className={`list-disc ${LIST_CLASS}`}>
          {PROMUEVA_INSTITUTION_KEYS.map((key) => (
            <li key={key}>{t(`about.${key}`)}</li>
          ))}
        </ul>
        <p className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
          <ExternalTextLink href={partnerHref("promueva")}>
            {t("about.promuevaSiteLink")}
          </ExternalTextLink>
          <ExternalTextLink href={PROMUEVA_TEAM_URL}>
            {t("about.promuevaTeamLink")}
          </ExternalTextLink>
        </p>
      </section>

      <Separator className="my-12" />

      <section aria-labelledby="avispa" className="flex flex-col gap-4">
        <h2 id="avispa" className={H2_CLASS}>
          {t("about.avispaTitle")}
        </h2>
        <p className={P_CLASS}>{t("about.avispaBody")}</p>
        <h3 className={H3_CLASS}>{t("about.avispaLinesTitle")}</h3>
        <ul className={`list-disc ${LIST_CLASS}`}>
          {AVISPA_LINE_KEYS.map((key) => (
            <li key={key}>{t(`about.${key}`)}</li>
          ))}
        </ul>
        <p className="pt-2">
          <ExternalTextLink href={partnerHref("avispa")}>{t("about.avispaLink")}</ExternalTextLink>
        </p>
      </section>

      <Separator className="my-12" />

      <section aria-labelledby="references" className="flex flex-col gap-4">
        <h2 id="references" className={H2_CLASS}>
          {t("about.referencesTitle")}
        </h2>
        <p className={P_CLASS}>{t("about.referencesIntro")}</p>
        <ol className="flex list-decimal flex-col gap-3 pl-6 leading-relaxed text-muted-foreground">
          <li>{t("about.reference1")}</li>
          <li>
            <Trans
              t={t}
              i18nKey="about.reference2"
              components={{ arxiv: <ExternalTextLink href={ARXIV_URL} inline /> }}
            />
          </li>
          <li>{t("about.reference3")}</li>
        </ol>
      </section>

      <Separator className="my-12" />

      <section aria-labelledby="partners" className="flex flex-col gap-6">
        <h2 id="partners" className={H2_CLASS}>
          {t("about.partnersTitle")}
        </h2>
        <p className={P_CLASS}>{t("about.partnersIntro")}</p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PARTNERS.map(({ id, src, alt, href }) => (
            <li key={id}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 rounded-md border border-border/60 px-4 py-3 transition-colors hover:bg-accent"
              >
                <span className="flex w-20 shrink-0 items-center justify-center rounded-md px-2 py-1 dark:bg-white">
                  {/* Decorative: the visible institution name is the link's accessible name */}
                  <img src={src} alt="" className="h-8 w-auto" />
                </span>
                <span className="text-sm font-medium text-foreground">{alt}</span>
                <span className="sr-only">{t("common.opensInNewTab")}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
