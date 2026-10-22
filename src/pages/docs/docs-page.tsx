import { type ReactNode, Suspense } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { registerDocsStrings } from "./lib/register-strings";
import { docContent } from "./model/content";
import { type DocLang, type DocSection, docLang, findDocSection } from "./model/sections";
import { DocsIndex, DocsPager, DocsSidebar } from "./ui/docs-nav";
import { MDX_COMPONENTS } from "./ui/mdx-components";

interface DocsPageProps {
  /** Shown for an unknown section (`/docs/<anything else>`): the app's 404 page. */
  notFound: ReactNode;
}

/** One section: its title from the registry, its text from the MDX file of the language read. */
function DocsSection({ section, lang }: { section: DocSection; lang: DocLang }) {
  const { t } = useTranslation();
  // Cached per section and language: re-renders reuse the loaded chunk
  const Content = docContent(section.id, lang);
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("docs.sectionNumber", { n: section.order })}
      </p>
      <h1 className="mt-2 font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl">
        {section.title[lang]}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{section.summary[lang]}</p>
      {/* The section's chunk loads here; the landing layout's "On this page" list picks up its
          headings once they render */}
      <Suspense
        fallback={
          <p role="status" className="mt-10 text-sm text-muted-foreground">
            {t("docs.loadingSection")}
          </p>
        }
      >
        <div className="mt-8 flex flex-col gap-4">
          <Content components={MDX_COMPONENTS} />
        </div>
      </Suspense>
    </>
  );
}

/**
 * The user manual (`/docs`, `/docs/:section`), a public page of the landing shell: the sections
 * on the left, the text in the language being read, previous / next links at the bottom, and the
 * layout's "On this page" list on the right.
 */
export function DocsPage({ notFound }: DocsPageProps) {
  registerDocsStrings();
  const { section: sectionId } = useParams<{ section?: string }>();
  const { i18n } = useTranslation();
  const lang = docLang(i18n.language);
  const section = findDocSection(sectionId);

  if (sectionId !== undefined && section === null) return notFound;

  return (
    <div className="flex flex-col gap-8 xl:flex-row xl:gap-12">
      <DocsSidebar lang={lang} />
      <article className="min-w-0 max-w-3xl flex-1">
        {section === null ? (
          <DocsIndex lang={lang} />
        ) : (
          <DocsSection section={section} lang={lang} />
        )}
        <DocsPager current={section?.id ?? null} lang={lang} />
      </article>
    </div>
  );
}
