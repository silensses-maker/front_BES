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
  // ── Comparación (hasta MAX_SERIES series en la gráfica) ──
  seriesGroupAria: "Series comparadas",
  seriesAria: "Serie {{label}}",
  seriesTip: "Mostrar la configuración de esta serie (otro clic la oculta)",
  seriesProblem: "requiere atención",
  configAria: "Configuración de la serie {{label}}",
  addSeriesAria: "Añadir una serie para comparar (una copia de la seleccionada, hasta {{max}})",
  addSeriesTip:
    "Comparar: añade una copia de la serie seleccionada y cambia lo que quieras comparar (hasta {{max}} series)",
  addSeriesLimit: "Hasta {{max}} series",
  removeSeriesAria: "Quitar la serie {{label}}",
  removeSeriesTip: "Quitar esta serie",
  overlayAria: "Superponer todas las medidas",
  overlayTip:
    "Superponer todas las medidas: reemplaza las series por cada medida definida para k = {{k}}, con los parámetros por defecto del paquete y creencia {{belief}} (la k y el tipo de creencia de la serie seleccionada), hasta {{max}}. Se puede deshacer. Normalizado (forma) compara medidas con escalas distintas.",
  overlayNone: "Ninguna medida está definida para k = {{k}}",
  overlayToast_one: "Se superpuso {{display}} medida (k = {{k}}, {{belief}})",
  overlayToast_other: "Se superpusieron {{display}} medidas (k = {{k}}, {{belief}})",
  overlaySkipped_one: "Omitida, no definida para k = {{k}}: {{names}}.",
  overlaySkipped_other: "Omitidas, no definidas para k = {{k}}: {{names}}.",
  overlayOmitted: "Fuera del límite de {{max}} series: {{names}}.",
  overlayUndo: "Deshacer",
  beliefShortPrivate: "privada",
  beliefShortPublic: "pública",
  axisAria: "Eje Y",
  axisValues: "Valores",
  axisNormalized: "Normalizado (forma)",
  axisTip:
    "Valores: todas las series en el mismo eje. Normalizado (forma): cada serie reescalada a [0, 1] según su propio mínimo y máximo en las rondas calculadas hasta ahora, para comparar formas; una serie constante se dibuja plana en 0,5.",
  tooltipValue: "valor {{value}}",
  valueOf: "{{label}}: {{value}}",
  valuesAria: "Valores en la ronda {{round}}",
  aboutCompare:
    "Cada serie se calcula por ronda en el servidor con el paquete pol_measures de PROMUEVA. Los umbrales de nivel solo se dibujan con una sola serie. Detalles en la wiki.",
  // ── Gráfica | Tabla ──
  viewAria: "Vista",
  viewChart: "Gráfica",
  viewTable: "Tabla",
  viewTip: "Gráfica o tabla de los mismos valores (calculados una vez, en el servidor)",
  table: {
    modeAria: "Contenido de la tabla",
    modeSeries: "Series",
    modeAll: "Todas las medidas",
    modeTip:
      "Series: las series comparadas, como las muestra la gráfica. Todas las medidas: cada medida con los parámetros por defecto del paquete, para un k y un tipo de creencia.",
    allKAria: "Número de categorías k de todas las medidas",
    allBeliefAria: "Tipo de creencia de todas las medidas",
    allTip:
      "Cada medida con los parámetros por defecto del paquete, para este k y tipo de creencia (parte de los de la serie seleccionada).",
    aria: "Valores de polarización por ronda",
    round: "Ronda",
    level: "Nivel",
    levelOf: "Nivel de {{label}}",
    notForK: "no definida para k = {{k}}",
    rounds_one: "{{display}} ronda",
    rounds_other: "{{display}} rondas",
    seekAria: "Ir a la ronda {{round}}",
    seekTip: "Haz clic en una fila para ir a esa ronda",
    cellPending: "Aún no calculado",
    cellNone: "Sin valor en esta ronda",
    cellError: "El paquete no pudo calcular esta ronda: {{message}}",
    cellUnsupported: "{{name}} no está definida para k = {{k}}",
    fullValue: "Valor exacto {{value}}",
    empty: "Aún no hay rondas calculadas.",
    emptyNoRounds: "Aún no hay rondas registradas.",
    export: "Exportar CSV",
    exportTip: "Descarga la tabla tal como se ve ({{mode}}), con las rondas calculadas hasta ahora",
    exportLong: "Largo (R / pandas)",
    exportLongHint: "Una fila por ronda y serie",
    exportWide: "Ancho (Excel)",
    exportWideHint: "Una fila por ronda, una columna por serie",
    exportEmpty: "Aún no hay nada que exportar",
    partial: "Parcial",
    partialLive: "Corrida en vivo: la exportación contiene las rondas calculadas hasta ahora.",
    partialComputing: "Aún calculando: la exportación contiene las rondas calculadas hasta ahora.",
    exportToast_one: "Exportada {{display}} fila a {{file}}.",
    exportToast_other: "Exportadas {{display}} filas a {{file}}.",
  },
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
    compareTitle: "Comparar medidas",
    compare1:
      "La gráfica puede superponer hasta diez series, cada una con su propia medida, parámetros, k y tipo de creencia: + añade una copia de la serie seleccionada, para cambiar un ajuste y comparar, × quita una, y Superponer todas las medidas las reemplaza por cada medida definida para la k de la serie seleccionada, con los parámetros por defecto del paquete (se puede deshacer). Las series se distinguen por color y estilo de línea: continua, y luego discontinua y punteada con algunos marcadores. Los umbrales de nivel solo se dibujan con una sola serie; con varias, al pasar el cursor por la gráfica se listan el valor y el nivel de cada serie.",
    compare2:
      "Normalizado (forma) reescala cada serie a [0, 1] según su propio mínimo y máximo en las rondas calculadas hasta ahora,",
    compare3:
      "para comparar por su forma medidas en escalas distintas; al pasar el cursor se conserva el valor real. Una serie constante se dibuja plana en 0,5.",
    sourceTitle: "Fuente",
    source1:
      "Los valores los calcula en el servidor el paquete pol_measures de PROMUEVA, de {{author}}; BiPol implementada por {{bipol}}; artículo de MEC {{paper}}. Usado con permiso de sus autores; la autoprueba del servidor verifica cada medida contra el paquete llamado directamente. Versión usada:",
    sourceLink: "repositorio de pol_measures",
  },
} as const;

export default polarizationEs;
