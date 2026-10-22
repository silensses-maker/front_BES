import { type ComponentType, type ElementType, type LazyExoticComponent, lazy } from "react";
import type { DocLang, DocSectionId } from "./sections";

/** Components an MDX section receives, by tag name (see ../ui/mdx-components.tsx). */
export type MdxComponents = Readonly<Record<string, ElementType>>;

/** A compiled MDX section. */
export type MdxContent = ComponentType<{ components?: MdxComponents }>;

type Loader = () => Promise<{ default: MdxContent }>;

/** polarization (#129): a build without the Polarization view emits no Polarization section. */
const NO_CONTENT: Loader = () => Promise.resolve({ default: () => null });

/**
 * One async chunk per section and language (`docs-<lang>-<id>`): opening a section downloads only
 * that file, in the language being read. Literal paths, so the bundler sees every file.
 */
const LOADERS: Readonly<Record<DocSectionId, Readonly<Record<DocLang, Loader>>>> = {
  "getting-started": {
    en: () =>
      import(/* webpackChunkName: "docs-en-getting-started" */ "../content/en/getting-started.mdx"),
    es: () =>
      import(/* webpackChunkName: "docs-es-getting-started" */ "../content/es/getting-started.mdx"),
  },
  "new-simulation": {
    en: () =>
      import(/* webpackChunkName: "docs-en-new-simulation" */ "../content/en/new-simulation.mdx"),
    es: () =>
      import(/* webpackChunkName: "docs-es-new-simulation" */ "../content/es/new-simulation.mdx"),
  },
  "my-experiments": {
    en: () =>
      import(/* webpackChunkName: "docs-en-my-experiments" */ "../content/en/my-experiments.mdx"),
    es: () =>
      import(/* webpackChunkName: "docs-es-my-experiments" */ "../content/es/my-experiments.mdx"),
  },
  "run-view": {
    en: () => import(/* webpackChunkName: "docs-en-run-view" */ "../content/en/run-view.mdx"),
    es: () => import(/* webpackChunkName: "docs-es-run-view" */ "../content/es/run-view.mdx"),
  },
  "charts-and-data": {
    en: () =>
      import(/* webpackChunkName: "docs-en-charts-and-data" */ "../content/en/charts-and-data.mdx"),
    es: () =>
      import(/* webpackChunkName: "docs-es-charts-and-data" */ "../content/es/charts-and-data.mdx"),
  },
  polarization: __POLARIZATION__
    ? {
        en: () =>
          import(/* webpackChunkName: "docs-en-polarization" */ "../content/en/polarization.mdx"),
        es: () =>
          import(/* webpackChunkName: "docs-es-polarization" */ "../content/es/polarization.mdx"),
      }
    : { en: NO_CONTENT, es: NO_CONTENT },
  profile: {
    en: () => import(/* webpackChunkName: "docs-en-profile" */ "../content/en/profile.mdx"),
    es: () => import(/* webpackChunkName: "docs-es-profile" */ "../content/es/profile.mdx"),
  },
};

const cache = new Map<string, LazyExoticComponent<MdxContent>>();

/**
 * The lazy component of a section in a language, created on first use and then reused, so a
 * re-render (or coming back to the section) never re-suspends on a chunk already loaded.
 */
export function docContent(id: DocSectionId, lang: DocLang): LazyExoticComponent<MdxContent> {
  const key = `${lang}/${id}`;
  let content = cache.get(key);
  if (content === undefined) {
    content = lazy(LOADERS[id][lang]);
    cache.set(key, content);
  }
  return content;
}
