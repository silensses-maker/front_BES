import { BookOpen, FlaskConical } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";

// ---------------------------------------------------------------------------
// Motion variants (landing page pattern from design system)
// ---------------------------------------------------------------------------
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

/**
 * Previous Results — "coming soon". No result is published yet: replications of experiments from
 * the literature (e.g. David Gaona's simulator work) recreated with SiLEnSeSS are future work, so
 * the page says so honestly and points to the Wiki and to creating a simulation.
 */
export function ResultsPage() {
  const { t } = useTranslation();

  return (
    <article className="flex flex-col gap-10">
      <motion.section
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4"
      >
        <motion.h1
          variants={item}
          className="font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl"
        >
          {t("results.pageTitle")}
        </motion.h1>
        <motion.p
          variants={item}
          className="max-w-2xl text-lg leading-relaxed text-muted-foreground"
        >
          {t("results.pageIntro")}
        </motion.p>
      </motion.section>

      <section aria-labelledby="results-coming-soon">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col items-start gap-4 py-8">
            <span className="inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-950/60 dark:text-brand-400">
              {t("results.comingSoonBadge")}
            </span>
            <h2
              id="results-coming-soon"
              className="font-display text-2xl font-normal tracking-tight text-foreground"
            >
              {t("results.comingSoonTitle")}
            </h2>
            <p className="max-w-2xl leading-relaxed text-muted-foreground">
              {t("results.comingSoonBody")}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild>
                <Link to="/wiki">
                  <BookOpen aria-hidden="true" />
                  {t("results.ctaWiki")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/board">
                  <FlaskConical aria-hidden="true" />
                  {t("results.ctaBoard")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </article>
  );
}
