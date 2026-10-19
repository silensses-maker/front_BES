import { ExternalLink, Mail } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { CONTACT_EMAIL } from "@/shared/config/contact";
import { partnerHref } from "@/shared/config/partners";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/shared/ui/card";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const CARD_H2_CLASS = "font-display text-2xl font-normal tracking-tight text-foreground";

function ExternalButton({ href, label }: { href: string; label: string }) {
  const { t } = useTranslation();

  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
        <ExternalLink aria-hidden="true" />
        <span className="sr-only">{t("common.opensInNewTab")}</span>
      </a>
    </Button>
  );
}

export function ContactPage() {
  const { t } = useTranslation();

  return (
    <article className="flex max-w-4xl flex-col gap-12">
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
          {t("contact.pageTitle")}
        </motion.h1>
        <motion.p variants={item} className="text-lg leading-relaxed text-muted-foreground">
          {t("contact.pageIntro")}
        </motion.p>
      </motion.header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 id="email" className={CARD_H2_CLASS}>
              {t("contact.emailTitle")}
            </h2>
            <CardDescription className="leading-relaxed">{t("contact.emailBody")}</CardDescription>
          </CardHeader>
          <CardContent className="mt-auto">
            {/* The address itself is the label so it can be read and copied; wraps on narrow screens */}
            <Button
              variant="outline"
              size="sm"
              className="h-auto min-h-8 max-w-full whitespace-normal break-all py-1.5 text-left"
              asChild
            >
              <a href={`mailto:${CONTACT_EMAIL}`}>
                <Mail aria-hidden="true" />
                {CONTACT_EMAIL}
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 id="research-group" className={CARD_H2_CLASS}>
              {t("contact.researchTitle")}
            </h2>
            <CardDescription className="leading-relaxed">
              {t("contact.researchBody")}
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto flex flex-wrap gap-3">
            <ExternalButton href={partnerHref("promueva")} label={t("contact.promuevaLink")} />
            <ExternalButton href={partnerHref("avispa")} label={t("contact.avispaLink")} />
            <ExternalButton href={partnerHref("univalle")} label={t("contact.univalleLink")} />
          </CardContent>
        </Card>
      </div>
    </article>
  );
}
