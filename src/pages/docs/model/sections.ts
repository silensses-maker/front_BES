/**
 * The user manual's registry: which sections exist, their order, their title and summary in each
 * language, and their URL (`/docs/<id>`). The page builds the sidebar, the index and the
 * previous / next links from here; the text of each section is its MDX file
 * (`../content/<lang>/<id>.mdx`, loaded by `./content.ts`).
 *
 * Adding a section: an id below, an entry in SECTIONS, its two MDX files and their loaders.
 */

export const DOC_LANGS = ["en", "es"] as const;
export type DocLang = (typeof DOC_LANGS)[number];

export const DOC_SECTION_IDS = [
  "getting-started",
  "new-simulation",
  "my-experiments",
  "run-view",
  "charts-and-data",
  "polarization",
  "profile",
] as const;
export type DocSectionId = (typeof DOC_SECTION_IDS)[number];

type Localized = Readonly<Record<DocLang, string>>;

export interface DocSection {
  readonly id: DocSectionId;
  /** Position in the manual (1 = first). */
  readonly order: number;
  readonly title: Localized;
  /** One sentence under the title, and on the index card. */
  readonly summary: Localized;
}

const SECTIONS: readonly DocSection[] = [
  {
    id: "getting-started",
    order: 1,
    title: { en: "Getting started", es: "Primeros pasos" },
    summary: {
      en: "What SiLEnSeSS is, how to sign in, what your role allows and how to move around the platform.",
      es: "Qué es SiLEnSeSS, cómo iniciar sesión, qué permite tu rol y cómo moverte por la plataforma.",
    },
  },
  {
    id: "new-simulation",
    order: 2,
    title: { en: "New simulation", es: "Nueva simulación" },
    summary: {
      en: "The wizard step by step: generated and custom networks, agents, review, seed, configuration files and quotas.",
      es: "El asistente paso a paso: redes generadas y personalizadas, agentes, revisión, semilla, archivos de configuración y cuotas.",
    },
  },
  {
    id: "my-experiments",
    order: 3,
    title: { en: "My experiments", es: "Mis experimentos" },
    summary: {
      en: "Your run history: filters, run details, re-launching a run, exporting its configuration, cancelling and run states.",
      es: "El historial de tus ejecuciones: filtros, detalles, relanzar una ejecución, exportar su configuración, cancelar y estados.",
    },
  },
  {
    id: "run-view",
    order: 4,
    title: { en: "Run view", es: "Vista de corrida" },
    summary: {
      en: "The network graph, the timeline, runs with several networks, and following a run live versus replaying it.",
      es: "El grafo de la red, la línea de tiempo, las ejecuciones con varias redes y la diferencia entre seguir una corrida en vivo y repetirla.",
    },
  },
  {
    id: "charts-and-data",
    order: 5,
    title: { en: "Charts and data", es: "Gráficos y datos" },
    summary: {
      en: "Every chart of a run and the data table, with its CSV export.",
      es: "Cada gráfica de una corrida y la tabla de datos, con su exportación CSV.",
    },
  },
  {
    id: "polarization",
    order: 6,
    title: { en: "Polarization", es: "Polarización" },
    summary: {
      en: "Polarization measures round by round: settings, levels, comparing measures, and the table with its CSV export.",
      es: "Medidas de polarización ronda a ronda: ajustes, niveles, comparación de medidas y la tabla con su exportación CSV.",
    },
  },
  {
    id: "profile",
    order: 7,
    title: { en: "Profile", es: "Perfil" },
    summary: {
      en: "Your account details, your quotas and how to deactivate the account.",
      es: "Los datos de tu cuenta, tus cuotas y cómo desactivar la cuenta.",
    },
  },
];

/**
 * The manual's sections in reading order. polarization (#129): a build without the Polarization
 * view has no Polarization section either.
 */
export const DOC_SECTIONS: readonly DocSection[] = SECTIONS.filter(
  (section) => __POLARIZATION__ || section.id !== "polarization",
).sort((a, b) => a.order - b.order);

/** The section with this URL id, or null (unknown section, or none: the index). */
export function findDocSection(id: string | undefined): DocSection | null {
  return DOC_SECTIONS.find((section) => section.id === id) ?? null;
}

/** Neighbours in reading order; the index (null) comes before the first section. */
export function adjacentDocSections(id: DocSectionId | null): {
  previous: DocSection | null;
  next: DocSection | null;
} {
  if (id === null) return { previous: null, next: DOC_SECTIONS[0] ?? null };
  const index = DOC_SECTIONS.findIndex((section) => section.id === id);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: DOC_SECTIONS[index - 1] ?? null,
    next: DOC_SECTIONS[index + 1] ?? null,
  };
}

/** The manual's language for an i18next language: Spanish variants read es, the rest en. */
export function docLang(language: string | undefined): DocLang {
  return language?.toLowerCase().startsWith("es") ? "es" : "en";
}

/** URL of a section, or of the index (null). */
export function docPath(id: DocSectionId | null): string {
  return id === null ? "/docs" : `/docs/${id}`;
}
