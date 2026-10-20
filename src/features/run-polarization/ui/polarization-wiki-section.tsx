import type { ReactNode } from "react";
import { useTranslation } from "@/shared/i18n";
// Metadata modules only (not the barrel): the wiki does not download the measure implementations.
import { ALIENATION_TEX } from "@/shared/lib/polarization/alienation";
import {
  LITERATURE_MEASURES,
  MEASURES,
  type MeasureId,
  type ParamSpec,
  PROPOSED_MEASURES,
  REFERENCES,
} from "@/shared/lib/polarization/registry";
import { POL_MEASURES_SOURCE } from "@/shared/lib/polarization/source";
import { THRESHOLDS } from "@/shared/lib/polarization/thresholds";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Mb, Mi } from "@/shared/ui/math";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

/** Formula of each measure as the replica computes it (pol_measures @ 0e05564). */
const FORMULAS: Readonly<Record<MeasureId, string>> = {
  EstebanRay:
    "\\mathrm{ER}_{\\alpha}(\\pi) = K \\sum_{i=1}^{k}\\sum_{j=1}^{k} \\pi_i^{1+\\alpha}\\,\\pi_j\\,|x_i - x_j|, \\qquad K = \\frac{1}{2\\cdot 0.5^{2+\\alpha}}",
  GeneralizedER:
    "\\mathrm{ER}_{\\alpha,f}(\\pi) = K \\sum_{i}\\sum_{j} \\pi_i^{1+\\alpha}\\,\\pi_j\\,f(|x_i - x_j|), \\qquad K = \\frac{1}{2\\cdot 0.5^{2+\\alpha}\\, f(x_k - x_1)}",
  EMDPol:
    "\\mathrm{EMD}_{\\mathrm{pol}}(\\pi) = 0.5 - \\mathrm{EMD}(\\pi, \\pi^{*}), \\qquad \\pi^{*} = \\tfrac12\\,\\delta_{x_1} + \\tfrac12\\,\\delta_{x_k}",
  Experts:
    "\\mathrm{Experts}(\\pi) = \\frac{2.14\\,\\pi_2\\pi_4 + 2.70\\,(\\pi_1\\pi_4 + \\pi_2\\pi_5) + 3.96\\,\\pi_1\\pi_5}{100 \\cdot 0.0099\\,\\left(\\sum_i \\pi_i\\right)^{2}}",
  ShannonPol:
    "\\mathrm{Shannon}_{\\mathrm{pol}}(\\pi) = -\\sum_{i} \\pi_i \\log_2\\!\\left(1 - \\frac{|x_i - \\mu|}{x_k - x_1}\\right), \\qquad \\mu = \\sum_i \\pi_i x_i",
  VanDerEijkPol:
    "\\mathrm{Eijk}_{\\mathrm{pol}}(\\pi) = 1 - \\frac{1 + A}{2}, \\qquad A = \\sum_{\\ell} w_\\ell\\, U_\\ell \\left(1 - \\frac{S_\\ell - 1}{k - 1}\\right)",
  MEC: "\\mathrm{MEC}_{\\alpha,\\beta}(\\pi) = \\min_{y \\in [0,1]} \\sum_{i} \\pi_i^{\\alpha}\\,|x_i - y|^{\\beta}",
  MECNormalized:
    "\\mathrm{MEC}^{*}_{\\alpha,\\beta}(\\pi) = \\left(\\frac{\\mathrm{MEC}_{\\alpha,\\beta}(\\pi)}{\\mathrm{MEC}_{\\alpha,\\beta}(\\pi^{*})}\\right)^{1/\\beta}",
  GeneralizedMEC:
    "\\mathrm{MEC}_{\\alpha,f}(\\pi) = \\min_{y \\in [0,1]} \\sum_{i} \\pi_i^{\\alpha}\\, f(|x_i - y|)",
  BiPol:
    "\\mathrm{BiPol}(\\pi) = 4\\,\\pi(L)\\,\\pi(R)\\,(\\mu_R - \\mu_L), \\qquad L = \\{x_i < \\mu\\},\\ R = \\{x_i \\ge \\mu\\}",
};

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

function paramTex(spec: ParamSpec): string {
  if (spec.kind === "choice") {
    const options = spec.options.map((id) => ALIENATION_TEX[id]).join(",\\ ");
    return `f(d) = ${ALIENATION_TEX[spec.defaultValue]}\\quad (${options})`;
  }
  if (spec.kind === "optional-number") return "";
  const range =
    spec.max === null
      ? `${spec.tex} > ${spec.minExclusive}`
      : `${spec.tex} \\in (${spec.minExclusive}, ${spec.max}]`;
  return `${spec.tex} = ${spec.defaultValue}\\quad (${range})`;
}

function MeasureCard({ id }: { id: MeasureId }) {
  const { t } = useTranslation();
  const meta = MEASURES[id];
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
          <Mb tex={FORMULAS[id]} />
        </p>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{t("polarization.wiki.params")}:</strong>{" "}
          {meta.params.length === 0
            ? t("polarization.wiki.noParams")
            : meta.params.map((spec, i) => (
                <span key={spec.key}>
                  {i > 0 && " · "}
                  {spec.kind === "optional-number" ? (
                    <>
                      <Mi tex="K" /> {t("polarization.wiki.kAuto")}
                    </>
                  ) : (
                    <Mi tex={paramTex(spec)} />
                  )}
                </span>
              ))}
          {meta.exactCategories !== null && <> · {t("polarization.wiki.onlyFive")}</>}
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

function thresholdsOf(id: "EstebanRay" | "BiPol" | "MECNormalized"): readonly number[] {
  const entry = THRESHOLDS[id];
  if (entry === undefined) return [];
  const methods = "params" in entry ? entry.sets.default : entry;
  return methods?.kmeans?.[3] ?? [];
}

/**
 * Wiki section "Polarization measures" (#129): binning, every pol_measures measure with its
 * formula, parameters and reference, the classification levels, and the attribution of the
 * replica. Rendered by the wiki page only when the replica is compiled in.
 */
export function PolarizationWikiSection() {
  const { t } = useTranslation();
  const rows = [
    { id: "EstebanRay", params: "\\alpha = 0.8" },
    { id: "BiPol", params: "" },
    { id: "MECNormalized", params: "\\alpha = 2,\\ \\beta = 1.15" },
  ] as const;

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
      {LITERATURE_MEASURES.map((id) => (
        <MeasureCard key={id} id={id} />
      ))}

      <h3 className="mt-4 font-display text-2xl font-normal tracking-tight text-foreground">
        {t("polarization.wiki.proposedTitle")}
      </h3>
      <p className="text-lg tracking-tight text-muted-foreground">
        {t("polarization.wiki.proposedIntro")}
      </p>
      {PROPOSED_MEASURES.map((id) => (
        <MeasureCard key={id} id={id} />
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
            {rows.map(({ id, params }) => {
              const [lowMedium, mediumHigh] = thresholdsOf(id);
              return (
                <TableRow key={id}>
                  <TableCell>
                    {MEASURES[id].name}
                    {params !== "" && (
                      <>
                        {" "}
                        (<Mi tex={params} />)
                      </>
                    )}
                  </TableCell>
                  <TableCell className="font-mono">{lowMedium}</TableCell>
                  <TableCell className="font-mono">{mediumHigh}</TableCell>
                </TableRow>
              );
            })}
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
          commit: POL_MEASURES_SOURCE.shortCommit,
          author: POL_MEASURES_SOURCE.author,
          bipol: POL_MEASURES_SOURCE.bipolCredit,
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
