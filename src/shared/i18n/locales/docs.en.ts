/**
 * User manual strings — the `docs` namespace of `en`, added at runtime by `registerDocsStrings`
 * (pages/docs) when the manual first renders: the manual is a lazy chunk, so these strings stay
 * out of the initial chunk. Only the navigation labels (`nav.manual`, `dashboard.manual`) live in
 * en.ts. The sections' titles and order come from the manual's registry
 * (src/pages/docs/model/sections.ts); their text, from the MDX files.
 */
const docsEn = {
  pageTitle: "User manual",
  // <wiki> and <faq> tags are rendered by <Trans> in the manual's index as links
  pageIntro:
    "How to use SiLEnSeSS step by step: signing in, configuring and launching simulations, following them live and analyzing their results. The theory behind the model is in the <wiki>Wiki</wiki>; short answers, in the <faq>FAQ</faq>.",
  sectionsLabel: "Manual sections",
  overview: "Overview",
  sectionNumber: "Section {{n}}",
  previous: "Previous",
  next: "Next",
  loadingSection: "Loading section…",
  tip: "Tip",
  warning: "Warning",
  screenshotPending: "Screenshot pending",
  screenshotFile: "File: {{file}}",
  previewLabel: "Preview of the interface: {{what}}",
} as const;

export default docsEn;
