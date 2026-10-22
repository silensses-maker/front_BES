import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { Trans, useTranslation } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import {
  adjacentDocSections,
  DOC_SECTIONS,
  type DocLang,
  type DocSection,
  type DocSectionId,
  docPath,
} from "../model/sections";

const NAV_ITEM =
  "block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The manual's sections, in order: a column on the left on wide screens, a wrapped list above the
 * text on narrow ones (where the landing layout's "On this page" column also leaves room).
 */
export function DocsSidebar({ lang }: { lang: DocLang }) {
  const { t } = useTranslation();
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(NAV_ITEM, isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground");

  return (
    <nav
      aria-label={t("docs.sectionsLabel")}
      className="xl:sticky xl:top-24 xl:w-56 xl:shrink-0 xl:self-start"
    >
      <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("docs.pageTitle")}
      </p>
      <ol className="flex flex-wrap gap-1 xl:flex-col xl:gap-0.5">
        <li>
          <NavLink to={docPath(null)} end className={itemClass}>
            {t("docs.overview")}
          </NavLink>
        </li>
        {DOC_SECTIONS.map((section) => (
          <li key={section.id}>
            <NavLink to={docPath(section.id)} className={itemClass}>
              <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                {section.order}.
              </span>
              {section.title[lang]}
            </NavLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function PagerLink({
  section,
  lang,
  direction,
}: {
  section: DocSection | null;
  lang: DocLang;
  direction: "previous" | "next";
}) {
  const { t } = useTranslation();
  const next = direction === "next";
  const Icon = next ? ArrowRight : ArrowLeft;
  const title = section === null ? t("docs.overview") : section.title[lang];
  return (
    <Link
      to={docPath(section?.id ?? null)}
      rel={next ? "next" : "prev"}
      className={cn(
        "flex flex-1 flex-col gap-1 rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/40",
        next ? "items-end text-right" : "items-start",
      )}
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {next ? null : <Icon className="size-3.5" aria-hidden="true" />}
        {next ? t("docs.next") : t("docs.previous")}
        {next ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      </span>
      <span className="font-medium text-foreground">{title}</span>
    </Link>
  );
}

/**
 * Previous / next section links under the text. The first section's "previous" is the index; the
 * last section has no "next".
 */
export function DocsPager({ current, lang }: { current: DocSectionId | null; lang: DocLang }) {
  const { previous, next } = adjacentDocSections(current);
  const showPrevious = current !== null;
  return (
    <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row">
      {showPrevious ? <PagerLink section={previous} lang={lang} direction="previous" /> : null}
      {next === null ? null : <PagerLink section={next} lang={lang} direction="next" />}
    </div>
  );
}

const INDEX_LINK = "font-medium text-primary underline underline-offset-4";

/** The manual's first page: what it covers, and one card per section. */
export function DocsIndex({ lang }: { lang: DocLang }) {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl">
        {t("docs.pageTitle")}
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        <Trans
          i18nKey="docs.pageIntro"
          components={{
            wiki: <Link to="/wiki" className={INDEX_LINK} />,
            faq: <Link to="/faq" className={INDEX_LINK} />,
          }}
        />
      </p>
      <ol className="mt-10 grid gap-4 sm:grid-cols-2">
        {DOC_SECTIONS.map((section) => (
          <li key={section.id}>
            <Link
              to={docPath(section.id)}
              className="flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card px-5 py-4 transition-colors hover:border-primary/50"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {t("docs.sectionNumber", { n: section.order })}
              </span>
              <span className="font-display text-xl text-foreground">{section.title[lang]}</span>
              <span className="text-sm leading-relaxed text-muted-foreground">
                {section.summary[lang]}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
