import { useEffect } from "react";
import { useTranslation } from "@/shared/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Separator } from "@/shared/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

declare global {
  interface Window {
    MathJax?: { typesetPromise?: () => Promise<void> };
  }
}

/** Inline math — pass raw TeX without delimiters */
const Mi = ({ tex }: { tex: string }) => (
  <span dangerouslySetInnerHTML={{ __html: `\\(${tex}\\)` }} />
);

/** Display (block) math — pass raw TeX without delimiters */
const Mb = ({ tex }: { tex: string }) => (
  <span dangerouslySetInnerHTML={{ __html: `$$${tex}$$` }} />
);

export function WikiPage() {
  const { t, i18n } = useTranslation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: i18n.language is an intentional trigger, not a value used inside the effect
  useEffect(() => {
    window.MathJax?.typesetPromise?.();
  }, [i18n.language]);

  const handleTabChange = (_value: string) => {
    setTimeout(() => {
      window.MathJax?.typesetPromise?.();
    }, 0);
  };

  return (
    <article className="max-w-4xl">
      <h1 className="font-display text-4xl font-normal tracking-tight text-foreground sm:text-5xl">
        {t("wiki.pageTitle")}
      </h1>
      <p className="mt-6 text-lg tracking-tight text-muted-foreground">
        {t("wiki.pageIntro1")}{" "}
        <strong className="text-foreground">{t("wiki.spiralOfSilence")}</strong>.
      </p>
      <p className="mt-4 text-lg tracking-tight text-muted-foreground">{t("wiki.pageIntro2")}</p>

      <Separator className="my-12" />

      {/* Section 1: DeGroot */}
      <section id="degroot" className="flex flex-col gap-4">
        <h2 className="font-display text-3xl font-normal tracking-tight text-foreground">
          {t("wiki.degroot.title")}
        </h2>
        <p className="text-lg tracking-tight text-muted-foreground">
          {t("wiki.degroot.p1")}{" "}
          <strong className="text-foreground">{t("wiki.degroot.weightedAverage")}</strong>{" "}
          {t("wiki.degroot.p1end")}
        </p>
        <p className="text-lg tracking-tight text-muted-foreground">
          {t("wiki.degroot.p2_1")} <Mi tex="i" /> {t("wiki.degroot.p2_2")} <Mi tex="B_{i}^{t}" />{" "}
          {t("wiki.degroot.p2_3")} <Mi tex="t" />
          {t("wiki.degroot.p2_4")} <Mi tex="j" /> {t("wiki.degroot.p2_5")} <Mi tex="i" />{" "}
          {t("wiki.degroot.p2_6")} <Mi tex="I_{ji}" />.
        </p>

        <Card className="overflow-x-auto">
          <CardHeader>
            <CardTitle>{t("wiki.degroot.equationTitle")}</CardTitle>
            <CardDescription>
              {t("wiki.degroot.equationDesc1")} <Mi tex="i" />
              {t("wiki.degroot.equationDesc2")}
              <Mi tex="t+1" />
              {t("wiki.degroot.equationDesc3")}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-xl md:text-2xl text-foreground">
              <Mb tex="B_{i}^{t+1} = \sum_{j \in N_{i} \cup \{i\}} I_{ji} \cdot B_{j}^{t}" />
            </p>
          </CardContent>
        </Card>

        <h3 className="font-display text-2xl font-normal tracking-tight text-foreground mt-4">
          {t("wiki.degroot.limitationTitle")}
        </h3>
        <p className="text-lg tracking-tight text-muted-foreground">
          {t("wiki.degroot.limitation1")}{" "}
          <strong className="text-foreground">{t("wiki.degroot.limitation1strong")}</strong>.
        </p>
        <p className="text-lg tracking-tight text-muted-foreground">
          {t("wiki.degroot.limitation2_1")} <em>{t("wiki.degroot.limitation2_not")}</em>{" "}
          {t("wiki.degroot.limitation2_2")}{" "}
          <strong className="text-foreground">{t("wiki.spiralOfSilence")}</strong>{" "}
          {t("wiki.degroot.limitation2_3")}
        </p>
      </section>

      <Separator className="my-12" />

      {/* Section 2: SOM Models */}
      <section id="som-models" className="flex flex-col gap-4">
        <h2 className="font-display text-3xl font-normal tracking-tight text-foreground">
          {t("wiki.som.title")}
        </h2>
        <p className="text-lg tracking-tight text-muted-foreground">
          {t("wiki.som.intro1_1")}{" "}
          <strong className="text-foreground">{t("wiki.som.silenceState")}</strong> (
          <Mi tex="S_{i}^{t}" />) {t("wiki.som.intro1_2")}{" "}
          <strong className="text-foreground">{t("wiki.som.speaking")}</strong> (
          <Mi tex="S_{i}^{t} = 1" />) {t("wiki.som.or")}{" "}
          <strong className="text-foreground">{t("wiki.som.silent")}</strong> (
          <Mi tex="S_{i}^{t} = 0" />
          ).
        </p>
        <p className="text-lg tracking-tight text-muted-foreground">{t("wiki.som.intro2")}</p>
        <ul className="list-disc list-inside text-lg text-muted-foreground flex flex-col gap-2">
          <li>
            <strong className="text-foreground">
              {t("wiki.som.toleranceLabel")} (<Mi tex="\tau_{i}" />
              ):
            </strong>{" "}
            {t("wiki.som.toleranceDesc_1")} <Mi tex="B_{i}^{t}" /> {t("wiki.som.toleranceDesc_2")}{" "}
            <Mi tex="i" /> {t("wiki.som.toleranceDesc_3")}
          </li>
          <li>
            <strong className="text-foreground">
              {t("wiki.som.majorityLabel")} (<Mi tex="\mathcal{M}_{i}" />
              ):
            </strong>{" "}
            {t("wiki.som.majorityDesc_1")} <em>{t("wiki.som.majorityDesc_proportion")}</em>{" "}
            {t("wiki.som.majorityDesc_2")} <Mi tex="i" /> {t("wiki.som.majorityDesc_3")}
          </li>
        </ul>

        <Tabs defaultValue="som" className="w-full mt-4" onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="som">{t("wiki.som.tabMemoryless")}</TabsTrigger>
            <TabsTrigger value="som-plus">{t("wiki.som.tabMemory")}</TabsTrigger>
          </TabsList>

          <TabsContent value="som">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Mi tex="SOM^{-}" />: Silence Opinion Memoryless
                </CardTitle>
                <CardDescription>{t("wiki.som.somMinus.description")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.coreIdeaTitle")}
                  </h4>
                  <p className="text-muted-foreground">
                    {t("wiki.som.somMinus.coreIdea_1")}{" "}
                    <em>{t("wiki.som.somMinus.coreIdea_only")}</em>{" "}
                    {t("wiki.som.somMinus.coreIdea_2")}{" "}
                    <strong className="text-foreground">
                      {t("wiki.som.somMinus.coreIdea_speaking")}
                    </strong>
                    {t("wiki.som.somMinus.coreIdea_3")}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.somMinus.eq2Title")}
                  </h4>
                  <p className="text-center text-lg md:text-xl text-foreground">
                    <Mb tex="B_{i}^{t+1} = B_{i}^{t} + \sum_{j \in N_{i}} I_{ji} \cdot S_{j}^{t} \cdot (B_{j}^{t} - B_{i}^{t})" />
                  </p>
                  <p className="text-muted-foreground">
                    {t("wiki.som.somMinus.eq2desc_1")} <Mi tex="S_{j}^{t}" />{" "}
                    {t("wiki.som.somMinus.eq2desc_2")} <Mi tex="j" />{" "}
                    {t("wiki.som.somMinus.eq2desc_3")}
                    <Mi tex="S_{j}^{t} = 0" />
                    {t("wiki.som.somMinus.eq2desc_4")}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.somMinus.eq3Title")}
                  </h4>
                  <p className="text-muted-foreground">
                    {t("wiki.som.somMinus.eq3desc_1")} <Mi tex="i" />{" "}
                    {t("wiki.som.somMinus.eq3desc_2")} <Mi tex="S_{i}^{t+1} = 1" />{" "}
                    {t("wiki.som.somMinus.eq3desc_3")}{" "}
                    <strong className="text-foreground">
                      {t("wiki.som.somMinus.eq3desc_nonSilent")}
                    </strong>{" "}
                    {t("wiki.som.somMinus.eq3desc_4")}
                    <Mi tex="N_{i}^{t}" />
                    {t("wiki.som.somMinus.eq3desc_5")} <Mi tex="\tau_{i}" />{" "}
                    {t("wiki.som.somMinus.eq3desc_6")} <Mi tex="\mathcal{M}_{i}" />.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.takeawayTitle")}
                  </h4>
                  <p className="text-muted-foreground">{t("wiki.som.somMinus.takeaway")}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="som-plus">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Mi tex="SOM^{+}" />: Silence Opinion Memory-based
                </CardTitle>
                <CardDescription>
                  {t("wiki.som.somPlus.description_1")}{" "}
                  <em>{t("wiki.som.somPlus.description_remember")}</em>{" "}
                  {t("wiki.som.somPlus.description_2")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.coreIdeaTitle")}
                  </h4>
                  <p className="text-muted-foreground">
                    {t("wiki.som.somPlus.coreIdea_1")} <em>{t("wiki.som.somPlus.coreIdea_all")}</em>{" "}
                    {t("wiki.som.somPlus.coreIdea_2")}{" "}
                    <strong className="text-foreground">
                      {t("wiki.som.somPlus.coreIdea_lastPublic")}
                    </strong>
                    .
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.somPlus.eq5Title")}
                  </h4>
                  <p className="text-center text-lg md:text-xl text-foreground">
                    <Mb tex="B_{i}^{t+1} = B_{i}^{t} + \sum_{j \in N_{i}} I_{ji} \cdot (pubB_{j}^{t} - B_{i}^{t})" />
                  </p>
                  <p className="text-muted-foreground">
                    {t("wiki.som.somPlus.eq5desc_1")} <Mi tex="pubB_{j}^{t}" />{" "}
                    {t("wiki.som.somPlus.eq5desc_2")}{" "}
                    <em>{t("wiki.som.somPlus.eq5desc_publicOpinion")}</em>{" "}
                    {t("wiki.som.somPlus.eq5desc_3")} <Mi tex="j" />
                    {t("wiki.som.somPlus.eq5desc_4")} <Mi tex="j" />{" "}
                    {t("wiki.som.somPlus.eq5desc_5")}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.somPlus.eq6Title")}
                  </h4>
                  <p className="text-muted-foreground">
                    {t("wiki.som.somPlus.eq6desc_1")}{" "}
                    <strong className="text-foreground">
                      {t("wiki.som.somPlus.eq6desc_currentPrivate")}
                    </strong>{" "}
                    (<Mi tex="B_{i}^{t}" />) {t("wiki.som.somPlus.eq6desc_2")}{" "}
                    <strong className="text-foreground">
                      {t("wiki.som.somPlus.eq6desc_publicOpinions")}
                    </strong>{" "}
                    (<Mi tex="pubB_{j}^{t}" />) {t("wiki.som.somPlus.eq6desc_3")}{" "}
                    <em>{t("wiki.som.somPlus.eq6desc_all")}</em> {t("wiki.som.somPlus.eq6desc_4")}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <h4 className="text-lg font-semibold text-foreground">
                    {t("wiki.som.takeawayTitle")}
                  </h4>
                  <p className="text-muted-foreground">
                    {t("wiki.som.somPlus.takeaway_1")}{" "}
                    <strong className="text-foreground">
                      {t("wiki.som.somPlus.takeaway_hiddenConsensus")}
                    </strong>
                    {t("wiki.som.somPlus.takeaway_2")}{" "}
                    <em>{t("wiki.som.somPlus.takeaway_private")}</em>{" "}
                    {t("wiki.som.somPlus.takeaway_3")}{" "}
                    <em>{t("wiki.som.somPlus.takeaway_public")}</em>{" "}
                    {t("wiki.som.somPlus.takeaway_4")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      <Separator className="my-12" />

      {/* Section 3: Variables */}
      <section id="variables" className="flex flex-col gap-4">
        <h2 className="font-display text-3xl font-normal tracking-tight text-foreground">
          {t("wiki.variables.title")}
        </h2>
        <p className="text-lg tracking-tight text-muted-foreground">{t("wiki.variables.intro")}</p>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">{t("wiki.variables.colNotation")}</TableHead>
                <TableHead>{t("wiki.variables.colVariable")}</TableHead>
                <TableHead>{t("wiki.variables.colDescription")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono">
                  <Mi tex="B_{i}^{t}" />
                </TableCell>
                <TableCell>{t("wiki.variables.opinion")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t("wiki.variables.opinionDesc_1")} <Mi tex="i" />{" "}
                  {t("wiki.variables.opinionDesc_2")} <Mi tex="t" />
                  {t("wiki.variables.opinionDesc_3")} <Mi tex="[0, 1]" />.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">
                  <Mi tex="I_{ji}" />
                </TableCell>
                <TableCell>{t("wiki.variables.influence")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t("wiki.variables.influenceDesc_1")} <Mi tex="j" />{" "}
                  {t("wiki.variables.influenceDesc_2")} <Mi tex="i" />
                  {t("wiki.variables.influenceDesc_3")} <Mi tex="i" />{" "}
                  {t("wiki.variables.influenceDesc_4")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">
                  <Mi tex="S_{i}^{t}" />
                </TableCell>
                <TableCell>{t("wiki.variables.silenceState")}</TableCell>
                <TableCell className="text-muted-foreground">
                  <Mi tex="1" /> = {t("wiki.variables.silenceStateDesc_speaking")}, <Mi tex="0" /> ={" "}
                  {t("wiki.variables.silenceStateDesc_silent")}.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">
                  <Mi tex="\tau_{i}" />
                </TableCell>
                <TableCell>{t("wiki.variables.toleranceRadius")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t("wiki.variables.toleranceDesc_1")} <Mi tex="i" />
                  {t("wiki.variables.toleranceDesc_2")} <Mi tex="B_{j}^{t}" />{" "}
                  {t("wiki.variables.toleranceDesc_3")}{" "}
                  <Mi tex="|B_{i}^{t} - B_{j}^{t}| \le \tau_{i}" />.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">
                  <Mi tex="\mathcal{M}_{i}" />
                </TableCell>
                <TableCell>{t("wiki.variables.majorityThreshold")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t("wiki.variables.majorityDesc_1")}{" "}
                  <em>{t("wiki.variables.majorityDesc_proportion")}</em>{" "}
                  {t("wiki.variables.majorityDesc_2")} <Mi tex="i" />{" "}
                  {t("wiki.variables.majorityDesc_3")}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono">
                  <Mi tex="pubB_{j}^{t}" />
                </TableCell>
                <TableCell>{t("wiki.variables.publicOpinion")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t("wiki.variables.publicOpinionDesc_1")} <Mi tex="SOM^{+}" />{" "}
                  {t("wiki.variables.publicOpinionDesc_2")} <Mi tex="j" />.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </section>

      <Separator className="my-12" />

      {/* Section 4: Conclusion */}
      <section id="conclusion" className="flex flex-col gap-4 mb-16">
        <h2 className="font-display text-3xl font-normal tracking-tight text-foreground">
          {t("wiki.conclusion.title")}
        </h2>
        <p className="text-lg tracking-tight text-muted-foreground">
          {t("wiki.conclusion.p1_1")} <em>{t("wiki.conclusion.p1_what")}</em>{" "}
          {t("wiki.conclusion.p1_2")} <em>{t("wiki.conclusion.p1_whether")}</em>
          {t("wiki.conclusion.p1_3")}
        </p>
        <p className="text-lg tracking-tight text-muted-foreground">{t("wiki.conclusion.p2")}</p>
        <ul className="list-disc list-inside text-lg text-muted-foreground flex flex-col gap-2">
          <li>
            <strong className="text-foreground">{t("wiki.conclusion.vocalMinoritiesTitle")}</strong>{" "}
            {t("wiki.conclusion.vocalMinorities")}
          </li>
          <li>
            <strong className="text-foreground">{t("wiki.conclusion.echoChamberTitle")}</strong>{" "}
            {t("wiki.conclusion.echoChamber_1")}
            <Mi tex="\tau" />
            {t("wiki.conclusion.echoChamber_2")}
          </li>
          <li>
            <strong className="text-foreground">{t("wiki.conclusion.publicPrivateTitle")}</strong>{" "}
            {t("wiki.conclusion.publicPrivate_1")} <Mi tex="SOM^{+}" />{" "}
            {t("wiki.conclusion.publicPrivate_2")}{" "}
            <em>{t("wiki.conclusion.publicPrivate_public")}</em>{" "}
            {t("wiki.conclusion.publicPrivate_3")}{" "}
            <em>{t("wiki.conclusion.publicPrivate_private")}</em>{" "}
            {t("wiki.conclusion.publicPrivate_4")}
          </li>
        </ul>
      </section>
    </article>
  );
}
