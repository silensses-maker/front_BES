import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ROLE_LIMITS, type UserRole } from "@/entities/user";
import { CONTACT_EMAIL } from "@/shared/config/contact";
import { Trans, useTranslation } from "@/shared/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

/** Lowest to highest — same order the quotas grow in `ROLE_LIMITS`. */
const QUOTA_ROLES: UserRole[] = ["Guest", "BaseUser", "Researcher", "Administrator"];

const ANSWER_CLASS = "leading-relaxed text-muted-foreground";

/** Mailto link for the contact address; <Trans> fills in the visible text. */
function MailLink({ children }: { children?: ReactNode }) {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium break-all text-primary underline underline-offset-4"
    >
      {children}
    </a>
  );
}

function FaqItem({
  id,
  question,
  children,
}: {
  id: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-2xl font-normal tracking-tight text-foreground">
        {question}
      </h2>
      {children}
    </section>
  );
}

function QuotasTable() {
  const { t, i18n } = useTranslation();
  const format = (value: number) =>
    Number.isFinite(value) ? value.toLocaleString(i18n.language) : t("common.unlimited");

  return (
    <div className="max-w-xl rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("faq.quotasColRole")}</TableHead>
            <TableHead className="text-right">{t("faq.quotasColAgents")}</TableHead>
            <TableHead className="text-right">{t("faq.quotasColIterations")}</TableHead>
            <TableHead className="text-right">{t("faq.quotasColNetworks")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {QUOTA_ROLES.map((role) => {
            const limits = ROLE_LIMITS[role];
            return (
              <TableRow key={role}>
                <TableCell className="font-medium text-foreground">{role}</TableCell>
                <TableCell className="text-right font-mono">{format(limits.maxAgents)}</TableCell>
                <TableCell className="text-right font-mono">
                  {format(limits.maxIterations)}
                </TableCell>
                <TableCell className="text-right font-mono">{format(limits.maxNetworks)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function FaqPage() {
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
          {t("faq.pageTitle")}
        </motion.h1>
        <motion.p variants={item} className="text-lg leading-relaxed text-muted-foreground">
          {t("faq.pageIntro")}
        </motion.p>
      </motion.header>

      <div className="flex flex-col gap-10">
        <FaqItem id="what-is" question={t("faq.whatIsQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.whatIsAnswer")}</p>
        </FaqItem>

        <FaqItem id="who-can-use" question={t("faq.whoCanUseQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.whoCanUseAnswer")}</p>
        </FaqItem>

        <FaqItem id="quotas" question={t("faq.quotasQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.quotasAnswer")}</p>
          <QuotasTable />
          <p className="text-sm text-muted-foreground">{t("faq.quotasNote")}</p>
        </FaqItem>

        <FaqItem id="retention" question={t("faq.retentionQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.retentionAnswer")}</p>
        </FaqItem>

        <FaqItem id="export-import" question={t("faq.exportQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.exportAnswer")}</p>
        </FaqItem>

        <FaqItem id="ai-prompt" question={t("faq.llmQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.llmAnswer")}</p>
        </FaqItem>

        <FaqItem id="requirements" question={t("faq.browserQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.browserAnswer")}</p>
        </FaqItem>

        <FaqItem id="model" question={t("faq.modelQuestion")}>
          <p className={ANSWER_CLASS}>{t("faq.modelAnswer")}</p>
          <p>
            <Link
              to="/wiki"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("faq.modelLink")}
            </Link>
          </p>
        </FaqItem>

        <FaqItem id="contact" question={t("faq.contactQuestion")}>
          <p className={ANSWER_CLASS}>
            <Trans
              t={t}
              i18nKey="faq.contactAnswer"
              values={{ email: CONTACT_EMAIL }}
              components={{ mail: <MailLink /> }}
            />
          </p>
        </FaqItem>
      </div>
    </article>
  );
}
