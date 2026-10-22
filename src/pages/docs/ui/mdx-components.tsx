import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/shared/i18n";
import { slugify } from "@/shared/lib/slugify";
import { Callout } from "@/shared/ui/callout";
import { Kbd } from "@/shared/ui/kbd";
import { Separator } from "@/shared/ui/separator";
import { nodeText } from "../lib/node-text";
import type { MdxComponents } from "../model/content";
import {
  CanvasLegendPreview,
  PolarizationLineStyles,
  RoleQuotasTable,
  RunStatusBadges,
  TimelineEventLegend,
  Ui,
  UiButton,
  UiPreview,
  WithPolarization,
} from "./doc-embeds";
import { Screenshot } from "./screenshot";

const HEADING_BASE = "scroll-mt-24 font-display font-normal tracking-tight text-foreground";

/**
 * Section headings carry an id from their text (accents dropped), so the landing layout's
 * "On this page" list links to them and every heading has a stable anchor.
 */
function H2({ children }: { children?: ReactNode }) {
  return (
    <h2 id={slugify(nodeText(children))} className={`${HEADING_BASE} mt-8 text-3xl`}>
      {children}
    </h2>
  );
}

function H3({ children }: { children?: ReactNode }) {
  return (
    <h3 id={slugify(nodeText(children))} className={`${HEADING_BASE} mt-4 text-2xl`}>
      {children}
    </h3>
  );
}

const LINK_CLASS = "font-medium text-primary underline underline-offset-4";

/** In-app paths navigate without a reload; anchors stay anchors; anything else opens apart. */
function A({ href = "", children }: ComponentProps<"a">) {
  if (href.startsWith("/")) {
    return (
      <Link to={href} className={LINK_CLASS}>
        {children}
      </Link>
    );
  }
  if (href.startsWith("#")) {
    return (
      <a href={href} className={LINK_CLASS}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {children}
    </a>
  );
}

function Tip({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Callout variant="tip" title={t("docs.tip")} className="my-1">
      {children}
    </Callout>
  );
}

function Warning({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Callout variant="warning" title={t("docs.warning")} className="my-1">
      {children}
    </Callout>
  );
}

/**
 * What the manual's MDX files can use without importing anything: the Markdown elements, styled
 * like the other landing pages, and the custom tags (callouts, keys, screenshots, previews of the
 * real interface).
 */
export const MDX_COMPONENTS: MdxComponents = {
  h2: H2,
  h3: H3,
  p: (props: ComponentProps<"p">) => (
    <p className="leading-relaxed text-muted-foreground" {...props} />
  ),
  a: A,
  strong: (props: ComponentProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: ComponentProps<"em">) => <em {...props} />,
  ul: (props: ComponentProps<"ul">) => (
    <ul
      className="ml-5 flex list-disc flex-col gap-1.5 leading-relaxed text-muted-foreground marker:text-muted-foreground"
      {...props}
    />
  ),
  ol: (props: ComponentProps<"ol">) => (
    <ol
      className="ml-5 flex list-decimal flex-col gap-1.5 leading-relaxed text-muted-foreground marker:text-muted-foreground"
      {...props}
    />
  ),
  li: (props: ComponentProps<"li">) => <li className="pl-1" {...props} />,
  code: (props: ComponentProps<"code">) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
      {...props}
    />
  ),
  hr: () => <Separator className="my-6" />,
  // Custom tags
  Tip,
  Warning,
  Kbd,
  Screenshot,
  Ui,
  UiPreview,
  UiButton,
  RoleQuotasTable,
  RunStatusBadges,
  CanvasLegendPreview,
  TimelineEventLegend,
  // polarization (#129)
  PolarizationLineStyles,
  WithPolarization,
};
