/**
 * MDX modules (@rsbuild/plugin-mdx in the build, @mdx-js/rollup under Vitest): each file compiles
 * to a component. `components` maps the Markdown elements (h2, a, table…) and the custom tags the
 * content uses (<Tip>, <Kbd>, <Screenshot>…) to React components, so the MDX files import nothing
 * themselves. Used by the user manual (src/pages/docs/content).
 */
declare module "*.mdx" {
  import type { ComponentType, ElementType } from "react";

  /** Components available to an MDX file, by tag name. */
  export type MdxComponents = Readonly<Record<string, ElementType>>;

  const MDXContent: ComponentType<{ components?: MdxComponents }>;
  export default MDXContent;
}
