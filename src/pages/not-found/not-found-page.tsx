import { ArrowLeft } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

/** Catch-all route — rendered inside the landing shell for any unknown URL. */
export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <motion.article
      variants={container}
      initial="hidden"
      animate="show"
      className="flex max-w-2xl flex-col gap-6"
    >
      <motion.p
        variants={item}
        className="font-mono text-sm font-medium uppercase tracking-wider text-muted-foreground"
      >
        {t("notFound.code")}
      </motion.p>
      <motion.h1
        variants={item}
        className="font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl"
      >
        {t("notFound.title")}
      </motion.h1>
      <motion.p variants={item} className="text-lg leading-relaxed text-muted-foreground">
        {t("notFound.body")}
      </motion.p>
      <motion.div variants={item}>
        <Button asChild>
          <Link to="/home">
            <ArrowLeft aria-hidden="true" />
            {t("notFound.backHome")}
          </Link>
        </Button>
      </motion.div>
    </motion.article>
  );
}
