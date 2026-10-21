/**
 * Textos de polarización (#129): el namespace `polarization` de `es`, que
 * `registerPolarizationStrings` (run-polarization) añade en tiempo de ejecución cuando la vista
 * Polarización o la sección de la wiki se muestran por primera vez (chunks diferidos: estos textos
 * no van en el chunk inicial). La etiqueta de la pestaña (`polarization.tab`) está en es.ts.
 */
const polarizationEs = {
  measureLabel: "Medida de polarización",
  groupLiterature: "Literatura",
  groupProposed: "Propuestas (PROMUEVA)",
  beta: "BETA",
  betaTip: "Sus autores aún la están desarrollando",
  onlyCategories: "solo k = {{k}}",
  notForK: "no para k = {{k}}",
  paramAria: "Parámetro {{name}}",
  paramTip: "{{name}} · por defecto {{value}} · rango {{range}}",
  paramKTip:
    "Constante de normalización K · vacío = automática (la normalización por defecto del paquete)",
  paramAuto: "auto",
  paramInvalid: "No aplicado: rango permitido {{range}}",
  alienationAria: "Función de alienación f(d)",
  alienationTip: "Función de alienación f aplicada a la distancia d entre opiniones",
  resetParamsAria: "Restaurar los parámetros por defecto",
  resetParamsTip: "Restaurar los valores por defecto del paquete",
  kAria: "Número de categorías k",
  kTip: "Las creencias se agrupan en k categorías de igual ancho sobre [0, 1], en las posiciones 0, 1/(k−1), …, 1. Experts requiere k = 5.",
  beliefAria: "Tipo de creencia",
  beliefPrivate: "Privada",
  beliefPublic: "Pública",
  beliefTip: "Privada: lo que los agentes creen. Pública: lo que expresan.",
  valueAt: "Ronda {{round}}",
  tooltipRound: "Ronda {{round}}",
  levelTip: "Nivel de la ronda vista según los umbrales del paquete (k-means, 3 niveles)",
  levels: {
    very_low: "muy bajo",
    low: "bajo",
    medium: "medio",
    high: "alto",
    very_high: "muy alto",
  },
  aboutAria: "Acerca de esta medida",
  aboutWithLevels:
    "Calculada por ronda en el servidor con el paquete pol_measures de PROMUEVA. Líneas punteadas: umbrales de nivel. Detalles en la wiki.",
  aboutNoLevels:
    "Calculada por ronda en el servidor con el paquete pol_measures de PROMUEVA. Esta medida no tiene umbrales de nivel con estos parámetros. Detalles en la wiki.",
  unsupportedK: "{{name}} no está definida para k = {{k}}.",
  useCategories: "Usar k = {{k}}",
  invalidParams: "Estos parámetros no son válidos para {{name}}.",
  catalogLoading: "Cargando las medidas de polarización…",
  computing: "Calculando…",
  computingAria: "Calculando la medida en el servidor",
  errorDisabled: "Las medidas de polarización no están disponibles en este servidor.",
  errorUnavailable:
    "El servidor no pudo calcular las medidas de polarización en este momento. Inténtalo de nuevo en unos segundos.",
  errorGeneric: "No se pudieron cargar las medidas de polarización.",
  retry: "Reintentar",
  wiki: {
    title: "Medidas de polarización",
    intro:
      "La gráfica Polarización de una corrida mide, ronda a ronda, qué tan polarizadas están las creencias de los agentes. Las medidas las calcula en el servidor el propio pol_measures, el paquete de medidas de polarización de PROMUEVA: SiLEnSeSS solo construye los histogramas.",
    binningTitle: "De las creencias a un histograma",
    binning1: "Toda medida recibe un histograma de opiniones: k categorías en las posiciones",
    binning2: "Una creencia",
    binning3: "cae en la categoría",
    binning4:
      ", y cada categoría pesa la fracción de agentes que contiene (el servidor normaliza los conteos),",
    binning5:
      "Por defecto k es 5 (también están 3, 7 y 10). Las medidas usan por defecto las creencias privadas (lo que los agentes piensan) o las públicas (lo que expresan).",
    literatureTitle: "Medidas de la literatura",
    proposedTitle: "Medidas propuestas por PROMUEVA",
    proposedIntro:
      "MEC (mínimo esfuerzo al consenso) define la polarización como el menor esfuerzo necesario para llevar a toda la población a una sola opinión.",
    params: "Parámetros",
    noParams: "ninguno",
    kAuto: "automática (la normalización por defecto)",
    onlyFive: "solo definida para k = 5",
    credit: "implementada por {{name}}",
    reference: "Referencia",
    meaning: {
      EstebanRay:
        "Grupos grandes, homogéneos por dentro y alejados entre sí. α pondera la identidad de grupo.",
      GeneralizedER:
        "Esteban–Ray con una función de alienación f aplicada a las distancias, escalada para que la mitad de la población en cada extremo valga 1.",
      EMDPol:
        "0,5 menos la Earth Mover's Distance a la distribución más polarizada, la mitad de la población en cada extremo.",
      Experts:
        "Índice ajustado a las calificaciones que 60 expertos dieron a 15 histogramas de cinco puntos.",
      ShannonPol:
        "Disensión de Tastle–Wierman: qué tan lejos, en términos de información, está la población de su opinión media.",
      VanDerEijkPol:
        "Acuerdo de Van der Eijk en escalas ordenadas, convertido en polarización (0 = acuerdo total). El histograma se divide en capas; A es su acuerdo ponderado.",
      MEC: "Menor costo de llevar a todos a una opinión y. α pondera el tamaño de los grupos y β qué tan rápido crece el costo con la distancia.",
      MECNormalized:
        "MEC relativa a la división extrema π* (la mitad de la población en cada extremo), de modo que π* vale 1.",
      GeneralizedMEC: "MEC con una función de alienación f en lugar de la distancia elevada a β.",
      BiPol:
        "Divide la población en la media; crece con la masa de cada lado y con la distancia entre sus medias.",
    },
    levelsTitle: "Niveles",
    levels1:
      "pol_measures publica umbrales para tres medidas. Cuando aplican, la gráfica los dibuja y da a la ronda vista el nivel bajo, medio o alto, con el método por defecto del paquete (k-means) y tres niveles:",
    colMeasure: "Medida",
    colLowMedium: "bajo → medio",
    colMediumHigh: "medio → alto",
    levels2:
      "Los umbrales solo aplican a los parámetros indicados; con cualquier otro valor no se muestra nivel.",
    sourceTitle: "Fuente",
    source1:
      "Los valores los calcula en el servidor el paquete pol_measures de PROMUEVA, de {{author}}; BiPol implementada por {{bipol}}; artículo de MEC {{paper}}. Usado con permiso de sus autores; la autoprueba del servidor verifica cada medida contra el paquete llamado directamente. Versión usada:",
    sourceLink: "repositorio de pol_measures",
  },
} as const;

export default polarizationEs;
