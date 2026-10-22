/**
 * Textos del manual de usuario: el namespace `docs` de `es`, que `registerDocsStrings`
 * (pages/docs) añade en tiempo de ejecución cuando el manual se muestra por primera vez (chunk
 * diferido: estos textos no van en el chunk inicial). Las etiquetas de navegación
 * (`nav.manual`, `dashboard.manual`) están en es.ts.
 */
const docsEs = {
  pageTitle: "Manual de usuario",
  // <wiki> y <faq> las renderiza <Trans> en el índice del manual como enlaces
  pageIntro:
    "Cómo usar SiLEnSeSS paso a paso: iniciar sesión, configurar y lanzar simulaciones, seguirlas en vivo y analizar sus resultados. La teoría detrás del modelo está en el <wiki>Wiki</wiki>; las respuestas breves, en las <faq>Preguntas frecuentes</faq>.",
  sectionsLabel: "Secciones del manual",
  overview: "Inicio del manual",
  sectionNumber: "Sección {{n}}",
  previous: "Anterior",
  next: "Siguiente",
  loadingSection: "Cargando sección…",
  tip: "Consejo",
  warning: "Atención",
  screenshotPending: "Captura pendiente",
  screenshotFile: "Archivo: {{file}}",
  previewLabel: "Vista previa de la interfaz: {{what}}",
} as const;

export default docsEs;
