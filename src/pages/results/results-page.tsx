import { Calendar } from "lucide-react";
import { motion, type Variants } from "motion/react";
import { useState } from "react";
import Markdown from "react-markdown";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";
import { FEATURED_RESULT, RESULT_ARTICLES } from "./results-placeholder.md";

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

// ---------------------------------------------------------------------------
// Markdown prose wrapper
// Applies project typography to rendered markdown without importing an
// external prose plugin — keeps the dependency footprint minimal.
// ---------------------------------------------------------------------------
function Prose({ children }: { children: string }) {
  return (
    <div className="prose-results">
      <Markdown
        components={{
          h2: ({ children: c }) => (
            <h2 className="font-display text-2xl font-normal tracking-tight text-foreground mt-6 mb-3">
              {c}
            </h2>
          ),
          h3: ({ children: c }) => (
            <h3 className="font-sans text-lg font-semibold text-foreground mt-4 mb-2">{c}</h3>
          ),
          p: ({ children: c }) => <p className="text-muted-foreground leading-relaxed mb-3">{c}</p>,
          strong: ({ children: c }) => (
            <strong className="font-semibold text-foreground">{c}</strong>
          ),
          ul: ({ children: c }) => (
            <ul className="list-disc list-inside flex flex-col gap-1 text-muted-foreground mb-3">
              {c}
            </ul>
          ),
          li: ({ children: c }) => <li className="leading-relaxed">{c}</li>,
          table: ({ children: c }) => (
            <div className="overflow-x-auto my-4">
              <table className="w-full text-sm border-collapse">{c}</table>
            </div>
          ),
          thead: ({ children: c }) => <thead className="border-b border-border">{c}</thead>,
          th: ({ children: c }) => (
            <th className="text-left py-2 px-3 font-semibold text-foreground">{c}</th>
          ),
          td: ({ children: c }) => (
            <td className="py-2 px-3 text-muted-foreground border-b border-border/50">{c}</td>
          ),
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResultCard — individual news/article card
// Supports two view modes: collapsed (list) and expanded (full content).
// The list→detail transition is done in-place so the layout is ready for a
// future router-based detail page without structural rework.
// ---------------------------------------------------------------------------
function ResultCard({
  slug,
  date,
  title,
  summary,
  content,
}: {
  slug: string;
  date: string;
  title: string;
  summary: string;
  content: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const formattedDate = new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Card
      id={slug}
      className="flex flex-col gap-0 overflow-hidden transition-shadow hover:shadow-md"
    >
      {/* Thumbnail placeholder — replace with <img> when real assets exist */}
      <div
        aria-hidden="true"
        className="h-36 bg-brand-100 dark:bg-brand-950/60 flex items-center justify-center shrink-0"
      >
        <span className="text-brand-400 dark:text-brand-600 text-xs font-mono tracking-widest uppercase select-none">
          SiLEnSeSS
        </span>
      </div>

      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Calendar className="size-3" aria-hidden="true" />
          <time dateTime={date}>
            {t("results.publishedOn")} {formattedDate}
          </time>
        </div>
        <CardTitle className="font-display text-xl font-normal leading-snug text-foreground">
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 flex-1">
        <p className="text-muted-foreground leading-relaxed text-sm">{summary}</p>

        {expanded && (
          <div className="border-t border-border pt-4">
            <Prose>{content}</Prose>
          </div>
        )}

        <div className="mt-auto pt-2">
          <Button
            variant={expanded ? "outline" : "default"}
            size="sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t("results.backToList") : t("results.readMore")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ResultsPage — main export
// ---------------------------------------------------------------------------
export function ResultsPage() {
  const { t } = useTranslation();

  return (
    <article className="flex flex-col gap-12">
      {/* Page header — staggered entrance */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Hero / Featured result */}
      {/* ------------------------------------------------------------------ */}
      <section id="featured" aria-labelledby="featured-heading">
        <div className="flex items-center gap-3 mb-4">
          <span className="inline-flex items-center rounded-full bg-brand-100 dark:bg-brand-950/60 px-3 py-1 text-xs font-semibold text-brand-700 dark:text-brand-400 tracking-wide uppercase">
            {t("results.featuredLabel")}
          </span>
          <Separator className="flex-1" />
        </div>

        <Card className="overflow-hidden">
          {/* Featured thumbnail placeholder */}
          <div
            aria-hidden="true"
            className="h-48 bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-950/80 dark:to-brand-900/60 flex items-center justify-center"
          >
            <span className="text-brand-400 dark:text-brand-500 text-sm font-mono tracking-widest uppercase select-none">
              PROMUEVA · SiLEnSeSS
            </span>
          </div>
          <CardContent className="pt-6 pb-8">
            <Prose>{FEATURED_RESULT}</Prose>
          </CardContent>
        </Card>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Article card grid                                                   */}
      {/* Pagination / infinite scroll can be inserted here by slicing        */}
      {/* RESULT_ARTICLES and rendering a <Pagination> component below        */}
      {/* the grid — the grid layout itself needs no changes.                 */}
      {/* ------------------------------------------------------------------ */}
      <section id="all-results" aria-labelledby="all-results-heading">
        <div className="flex items-center gap-3 mb-6">
          <h2
            id="all-results-heading"
            className="font-display text-2xl font-normal tracking-tight text-foreground shrink-0"
          >
            {t("results.allResultsHeading")}
          </h2>
          <Separator className="flex-1" />
        </div>

        {RESULT_ARTICLES.length === 0 ? (
          <p className="text-muted-foreground">{t("results.emptyState")}</p>
        ) : (
          /**
           * Grid:  1 column on mobile → 2 on md → up to 3 on xl.
           * To add pagination: wrap this in a component that slices
           * RESULT_ARTICLES[page * PAGE_SIZE .. (page+1) * PAGE_SIZE]
           * and renders a <Pagination> below.
           */
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 items-start">
            {RESULT_ARTICLES.map((article) => (
              <ResultCard key={article.slug} {...article} />
            ))}
          </div>
        )}

        {/* Pagination slot — insert <Pagination> component here when needed */}
        {/* <div className="mt-10 flex justify-center" id="results-pagination" /> */}
      </section>
    </article>
  );
}
