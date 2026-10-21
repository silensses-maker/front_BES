import type { ReactNode } from "react";
import { useTranslation } from "@/shared/i18n";
import { POL_MEASURES_SOURCE } from "@/shared/lib/polarization/source";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Mb, Mi } from "@/shared/ui/math";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
// Documentation only (the wiki is public: it cannot read the server's authenticated catalog).
import {
  LEVEL_DOCS,
  LITERATURE_DOCS,
  type MeasureDoc,
  PROPOSED_DOCS,
  REFERENCES,
} from "../lib/measure-docs";
import { registerPolarizationStrings } from "../lib/register-strings";

/** External link (new tab) following the about page's pattern. */
function ExternalTextLink({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-4"
    >
      {children}
      <span className="sr-only">{t("common.opensInNewTab")}</span>
    </a>
  );
}

function MeasureCard({ meta }: { meta: MeasureDoc }) {
  const { t } = useTranslation();
  const id = meta.id;
  return (
    <Card className="overflow-x-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {meta.name}
          {meta.beta && (
            <span className="rounded-full bg-warn/15 px-2 py-px font-sans text-[11px] font-semibold text-warn">
              {t("polarization.beta")}
            </span>
          )}
        </CardTitle>
        <CardDescription>{t(`polarization.wiki.meaning.${id}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-center text-base text-foreground md:text-lg">
          <Mb tex={meta.formula} />
        </p>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{t("polarization.wiki.params")}:</strong>{" "}
          {meta.params.length === 0
            ? t("polarization.wiki.noParams")
            : meta.params.map((param, i) => (
                <span key={"tex" in param ? param.tex : "K"}>
                  {i > 0 && " · "}
                  {"tex" in param ? (
                    <Mi tex={param.tex} />
                  ) : (
                    <>
                      <Mi tex="K" /> {t("polarization.wiki.kAuto")}
                    </>
                  )}
                </span>
              ))}
          {meta.onlyFive && <> · {t("polarization.wiki.onlyFive")}</>}
          {meta.credit !== null && <> · {t("polarization.wiki.credit", { name: meta.credit })}</>}
        </p>
        {meta.references.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{t("polarization.wiki.reference")}:</strong>{" "}
            {meta.references.map((ref, i) => (
              <span key={ref}>
                {i > 0 && "; "}
                <ExternalTextLink href={REFERENCES[ref].url}>
                  {REFERENCES[ref].citation}
                </ExternalTextLink>
                {REFERENCES[ref].readme !== null && ` [${REFERENCES[ref].readme}]`}
              </span>
            ))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Wiki section "Polarization measures" (#129): binning, every pol_measures measure with its
 * formula, parameters and reference, the classification levels, and the attribution: the values
 * are computed on the server by pol_measures at the pinned commit. Rendered by the wiki page only
 * when polarization is compiled in.
 */
export function PolarizationWikiSection() {
  registerPolarizationStrings();
  const { t } = useTranslation();

  return (
    <section id="polarization" className="flex flex-col gap-4">
      <h2 className="font-display text-3xl font-normal tracking-tight text-foreground">
        {t("polarization.wiki.title")}
      </h2>
      <p className="text-lg tracking-tight text-muted-foreground">{t("polarization.wiki.intro")}</p>

      <h3 className="mt-4 font-display text-2xl font-normal tracking-tight text-foreground">
        {t("polarization.wiki.binningTitle")}
      </h3>
      <p className="text-lg tracking-tight text-muted-foreground">
        {t("polarization.wiki.binning1")} <Mi tex="x_j = \frac{j}{k-1},\ j = 0,\dots,k-1" />.{" "}
        {t("polarization.wiki.binning2")} <Mi tex="b" /> {t("polarization.wiki.binning3")}{" "}
        <Mi tex="j(b) = \min(k-1, \lfloor b\,k \rfloor)" />
        {t("polarization.wiki.binning4")} <Mi tex="\pi_j = n_j / n" />.
      </p>
      <p className="text-lg tracking-tight text-muted-foreground">
        {t("polarization.wiki.binning5")}
      </p>

      <h3 className="mt-4 font-display text-2xl font-normal tracking-tight text-foreground">
        {t("polarization.wiki.literatureTitle")}
      </h3>
      {LITERATURE_DOCS.map((meta) => (
        <MeasureCard key={meta.id} meta={meta} />
      ))}

      <h3 className="mt-4 font-display text-2xl font-normal tracking-tight text-foreground">
        {t("polarization.wiki.proposedTitle")}
      </h3>
      <p className="text-lg tracking-tight text-muted-foreground">
        {t("polarization.wiki.proposedIntro")}
      </p>
      {PROPOSED_DOCS.map((meta) => (
        <MeasureCard key={meta.id} meta={meta} />
      ))}

      <h3 className="mt-4 font-display text-2xl font-normal tracking-tight text-foreground">
        {t("polarization.wiki.levelsTitle")}
      </h3>
      <p className="text-lg tracking-tight text-muted-foreground">
        {t("polarization.wiki.levels1")}
      </p>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("polarization.wiki.colMeasure")}</TableHead>
              <TableHead>{t("polarization.wiki.colLowMedium")}</TableHead>
              <TableHead>{t("polarization.wiki.colMediumHigh")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {LEVEL_DOCS.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {row.name}
                  {row.paramsTex !== "" && (
                    <>
                      {" "}
                      (<Mi tex={row.paramsTex} />)
                    </>
                  )}
                </TableCell>
                <TableCell className="font-mono">{row.lowMedium}</TableCell>
                <TableCell className="font-mono">{row.mediumHigh}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-lg tracking-tight text-muted-foreground">
        {t("polarization.wiki.levels2")}
      </p>

      <h3 className="mt-4 font-display text-2xl font-normal tracking-tight text-foreground">
        {t("polarization.wiki.sourceTitle")}
      </h3>
      <p className="text-lg tracking-tight text-muted-foreground">
        {t("polarization.wiki.source1", {
          author: POL_MEASURES_SOURCE.author,
          bipol: POL_MEASURES_SOURCE.bipolCredit,
          paper: POL_MEASURES_SOURCE.paper,
        })}{" "}
        <ExternalTextLink
          href={`${POL_MEASURES_SOURCE.repository}/tree/${POL_MEASURES_SOURCE.commit}`}
        >
          {t("polarization.wiki.sourceLink")}
        </ExternalTextLink>
        .
      </p>
    </section>
  );
}
