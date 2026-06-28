"use strict";

/**
 * Venezuela Earthquake Copernicus Data Dashboard 2026
 *
 * Robust Copernicus loader:
 * - Reads EMSR884 manifest.
 * - Finds Caracas AOI02.
 * - Finds builtUpA / transportationL / notAnalysedA URLs.
 * - Auto-detects whether each .json is:
 *   1. raw GeoJSON FeatureCollection, or
 *   2. TileJSON for Vector Tiles.
 *
 * No Mapbox token required.
 */

const COPERNICUS_API_URL =
  "https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR884";

const COPERNICUS_CACHE_TTL_MS = 30 * 60 * 1000;
const COPERNICUS_MANIFEST_CACHE_KEY = "emsr884-manifest-cache-v4-inline-products";

const COPERNICUS_FORCE_REFRESH = (() => {
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("refresh") ||
    params.has("forceRefresh") ||
    params.has("nocache")
  );
})();

// Layer JSON cache for the current browser tab/session.
// This prevents re-downloading large GeoJSON files when the user switches
// from one AOI to another and then returns to the previous AOI.
const JSON_DOCUMENT_MEMORY_CACHE = new Map();


const CARACAS = {
  id: "AOI02",
  name: "Caracas",
  center: [-66.9036, 10.4806],
  zoom: 11.2,
  pitch: 0,
  bearing: 0,
};

/* AOI selector globals: start */
const DEFAULT_AOI_NUMBER = 2;

let selectedAoiNumber = getInitialAoiNumber();
let selectedProductKey = getInitialProductKey();
let latestAois = [];
let currentProductOptions = [];

const TRANSPORTATION_LAYER_IDS = [
  "transportation-local-road-line",
  "transportation-track-line",
  "transportation-main-road-line",
  "transportation-highway-line",
  "transportation-airfield-runway-line",
  "transportation-railway-line",
  "transportation-railway-ticks",
];

const AOI_LAYER_IDS = [
  "aoi-fill",
  "aoi-outline",
];

const GROUND_MOVEMENT_CLASSES = [
  {
    key: "groundNegHigh",
    id: "neg-high",
    value: "-0.5 to -0.2",
    color: "#4965ad",
  },
  {
    key: "groundNegMedium",
    id: "neg-medium",
    value: "-0.2 to -0.1",
    color: "#76a3c7",
  },
  {
    key: "groundNegLow",
    id: "neg-low",
    value: "-0.1 to -0.05",
    color: "#b4d8e7",
  },
  {
    key: "groundNearZeroNeg",
    id: "near-zero-neg",
    value: "-0.05 to 0",
    color: "#e4f3f8",
  },
  {
    key: "groundNearZeroPos",
    id: "near-zero-pos",
    value: "0 to 0.05",
    color: "#fee6a6",
  },
  {
    key: "groundPosLow",
    id: "pos-low",
    value: "0.05 to 0.1",
    color: "#f6ad68",
  },
  {
    key: "groundPosMedium",
    id: "pos-medium",
    value: "0.1 to 0.2",
    color: "#e56845",
  },
  {
    key: "groundPosHigh",
    id: "pos-high",
    value: "0.2 to 0.5",
    color: "#be2f2f",
  },
  {
    key: "groundAboveHigh",
    id: "above-high",
    value: "Above 0.5",
    color: "#9e182c",
  },
];

const GROUND_MOVEMENT_LAYER_IDS = GROUND_MOVEMENT_CLASSES.flatMap((item) => [
  `ground-movement-${item.id}-fill`,
  `ground-movement-${item.id}-outline`,
]);

const DATA_LAYER_IDS = [
  "built-up-fill",
  "built-up-outline",
  "built-up-point-halo",
  "built-up-point-circle",

  "facilities-area-fill",
  "facilities-area-outline",

  "transportation-area-fill",
  "transportation-area-outline",

  "crisis-point-halo",
  "crisis-point-circle",

  // Legacy layer ids from older versions.
  "transportation-lines",
  "transportation-other-line",

  ...TRANSPORTATION_LAYER_IDS,

  ...GROUND_MOVEMENT_LAYER_IDS,
  "not-analysed-fill",
  "not-analysed-hatch-fill",
  "not-analysed-outline",

  ...AOI_LAYER_IDS,
];
/* AOI selector globals: end */

/**
 * Manual emergency fallback.
 * These may be GeoJSON URLs OR TileJSON URLs.
 */
const COPERNICUS_URL_OVERRIDES = {
  builtUpA: "",
  builtUpP: "",
  transportationL: "",
  transportationA: "",
  facilitiesA: "",
  ancillaryCrisisInfoP: "",
  notAnalysedA: "",
  groundMovementA: "",
};

const SOURCE_IDS = {
  builtUpA: "copernicus-built-up-a",
  builtUpP: "copernicus-built-up-p",
  transportationL: "copernicus-transportation-l",
  transportationA: "copernicus-transportation-a",
  facilitiesA: "copernicus-facilities-a",
  ancillaryCrisisInfoP: "copernicus-ancillary-crisis-info-p",
  notAnalysedA: "copernicus-not-analysed-a",
  groundMovementA: "copernicus-ground-movement-a",
  aoi: "selected-aoi-extent",
};

const BASE_LAYER_IDS = {
  satellite: "basemap-satellite",
  street: "basemap-street",
  labels: "basemap-labels",
};

const translations = {
  es: {
    eyebrow: "Panel satelital público",
    title: "Terremoto de Venezuela 2026: panel geoespacial de impacto (EMSR884)",
    subtitle: "Interfaz no oficial para evaluaciones satelitales de Copernicus (gradación y movimiento del terreno).",
    mobileTitle: "Terremoto de Venezuela 2026: panel geoespacial de impacto (EMSR884)",

    safetyTitle: "Aviso de seguridad pública",
    safetyText:
      "Este panel es solo para información pública. No es una herramienta oficial de rescate, evacuación o respuesta de emergencia. Siga siempre a las autoridades locales.",

    areasTitle: "Áreas de interés",
    caracasStatus: "Activo — datos satelitales disponibles",
    processing: "Procesando datos satelitales",
    otherCities: "Otras AOI",

    basemapTitle: "Mapa base",
    satelliteBasemap: "Satélite + calles",
    streetBasemap: "Calles OSM suaves",
    satelliteLabels: "Mostrar nombres de calles sobre satélite",
    basemapNote:
      "Prototipo: satélite por Esri; calles claras por CARTO/OpenStreetMap. Para tráfico masivo, cambiar a un proveedor de teselas de producción.",

    dataStatusTitle: "Estado de los datos",
    officialSource: "Fuente oficial Copernicus EMSR884",
    activationCode: "Activación",
    aoiProduct: "Área / producto",
    copernicusDelivery: "Entrega de Copernicus",
    satelliteAcquisition: "Imagen satelital",
    lastChecked: "Última comprobación",
    lastSuccessfulLoad: "Carga correcta del visor",
    cacheStatus: "Cache",
    refreshData: "Actualizar datos",
    dataFreshnessNote:
      "Este visor comprueba el manifiesto oficial de Copernicus como máximo cada 30 minutos por navegador. La entrega de Copernicus indica cuándo Copernicus publicó el producto; la última comprobación indica cuándo este visor revisó la fuente oficial.",
    cacheLive: "Directo",
    cacheFresh: "Cache reciente",
    cacheStale: "Cache antiguo",
    newData: "Nuevo",
    recentData: "Reciente",
    olderData: "Revisar fecha",
    notAvailable: "No disponible",
    legendTitle: "Leyenda",
    possiblyDamaged: "Posible daño",
    confirmedDamaged: "Daño / daño confirmado",
    destroyed: "Destruido",
    roads: "Carreteras / transporte",
    notAnalysed: "No analizado / nubes",

    dataTitle: "Aclaración de datos",
    dataText:
      "Las clases de daño son evaluaciones remotas por satélite y pueden requerir verificación en campo. Amarillo significa posible daño, no destrucción confirmada. El tramado gris significa que el área no fue analizada porque la vista satelital estaba obstruida o no disponible.",

    source: "Fuente",
    unofficial:
      "Interfaz no oficial de interés público. No se recopilan datos de rescate ni de víctimas.",

    builtBy: "Construido por YIN Renlong · Interfaz no oficial de interés público usando datos públicos de Copernicus EMSR884.",
    issueText: "Si encuentra un problema, visite el proyecto en GitHub.",
    footerCredit: "Interfaz pública no oficial. No recopila datos de rescate, víctimas ni personas desaparecidas. Si encuentra un problema,",
    footerGithubLink: "visite el proyecto en GitHub",
    footerAuthorPrefix: "Construido por",
    footerPeriod: ".",
    loadingTitle: "Cargando datos satelitales",
    loadingText: "Obteniendo capas públicas de Copernicus EMSR884.",
    largeLayerLoadingTitle: "Cargando una capa geoespacial grande",
    largeLayerLoadingText: "Se está descargando una capa grande de Copernicus. La primera carga puede tardar en conexiones lentas; al volver a esta AOI en la misma sesión del navegador se reutilizarán los datos en caché cuando sea posible.",
    loadedTitle: "Datos satelitales cargados",
    loadedText: "Capas públicas cargadas correctamente.",
    unavailableTitle: "Datos satelitales temporalmente no disponibles",
    unavailableText:
      "No se pudieron cargar las capas públicas de Copernicus. Puede ser un problema temporal, CORS o un cambio en el manifiesto de datos.",
    retry: "Reintentar",
  },

  en: {
    eyebrow: "Public satellite dashboard",
    title: "Venezuela 2026 Earthquake: Geospatial Impact Dashboard (EMSR884)",
    subtitle: "Unofficial interface for Copernicus satellite assessments (grading and ground movement).",
    mobileTitle: "Venezuela 2026 Earthquake: Geospatial Impact Dashboard (EMSR884)",

    safetyTitle: "Public safety notice",
    safetyText:
      "This dashboard is for public information only. It is not an official rescue, evacuation, or emergency response tool. Always follow local authorities.",

    areasTitle: "Areas of interest",
    caracasStatus: "Active — satellite data available",
    processing: "Processing satellite data",
    otherCities: "Other AOIs",

    basemapTitle: "Basemap",
    satelliteBasemap: "Satellite + streets",
    streetBasemap: "Muted OSM",
    satelliteLabels: "Show street names over satellite",
    basemapNote:
      "Prototype: satellite imagery by Esri; clean street map by CARTO/OpenStreetMap. For massive traffic, replace with a production tile provider.",

    dataStatusTitle: "Data status",
    officialSource: "Official Copernicus EMSR884 source",
    activationCode: "Activation",
    aoiProduct: "Area / product",
    copernicusDelivery: "Copernicus delivery",
    satelliteAcquisition: "Satellite image",
    lastChecked: "Last checked",
    lastSuccessfulLoad: "Last successful dashboard load",
    cacheStatus: "Cache",
    refreshData: "Refresh data",
    dataFreshnessNote:
      "This dashboard checks the official Copernicus manifest at most every 30 minutes per browser. Copernicus delivery means when Copernicus published the product; last checked means when this dashboard checked the official source.",
    cacheLive: "Live",
    cacheFresh: "Fresh cache",
    cacheStale: "Old cache",
    newData: "New",
    recentData: "Recent",
    olderData: "Check date",
    notAvailable: "Not available",
    legendTitle: "Legend",
    possiblyDamaged: "Possibly damaged",
    confirmedDamaged: "Damaged / confirmed damage",
    destroyed: "Destroyed",
    roads: "Roads / transport lines",
    notAnalysed: "Not analysed / clouds",

    dataTitle: "Data clarification",
    dataText:
      "Damage classes are remote satellite assessments and may require field verification. Yellow means possibly damaged, not confirmed destruction. Gray hatching means the area was not analysed because the satellite view was obstructed or unavailable.",

    source: "Source",
    unofficial:
      "Unofficial public-interest interface. No rescue or casualty data is collected.",

    builtBy: "Built by YIN Renlong · Unofficial public-interest interface using public Copernicus EMSR884 data.",
    issueText: "If you find an issue, please visit the GitHub project.",
    footerCredit: "Unofficial public interface. No rescue, casualty, or missing-person data is collected. If you find an issue,",
    footerGithubLink: "visit the GitHub project",
    footerAuthorPrefix: "Built by",
    footerPeriod: ".",
    loadingTitle: "Loading satellite data",
    loadingText: "Fetching Copernicus EMSR884 public layers.",
    largeLayerLoadingTitle: "Loading large geospatial layer",
    largeLayerLoadingText: "Downloading a large Copernicus layer. The first load may take some time on slower connections; revisiting this AOI in the same browser session will reuse cached data when possible.",
    loadedTitle: "Satellite data loaded",
    loadedText: "Public layers loaded successfully.",
    unavailableTitle: "Satellite data temporarily unavailable",
    unavailableText:
      "The public Copernicus layers could not be loaded. This may be temporary, caused by CORS, or caused by a change in the data manifest.",
    retry: "Retry",
  },

  it: {
    eyebrow: "Dashboard satellitare pubblico",
    title: "Terremoto in Venezuela 2026: dashboard geospaziale dell’impatto (EMSR884)",
    subtitle: "Interfaccia non ufficiale per le valutazioni satellitari Copernicus (classificazione e movimento del suolo).",
    mobileTitle: "Terremoto in Venezuela 2026: dashboard geospaziale dell’impatto (EMSR884)",

    safetyTitle: "Avviso di sicurezza pubblica",
    safetyText:
      "Questa dashboard è solo a scopo informativo. Non è uno strumento ufficiale di soccorso, evacuazione o risposta alle emergenze. Seguire sempre le autorità locali.",

    areasTitle: "Aree di interesse",
    caracasStatus: "Attivo — dati satellitari disponibili",
    processing: "Elaborazione dati satellitari",
    otherCities: "Altre AOI",

    basemapTitle: "Mappa base",
    satelliteBasemap: "Satellite + strade",
    streetBasemap: "OSM morbida",
    satelliteLabels: "Mostra i nomi delle strade sul satellite",
    basemapNote:
      "Prototipo: immagini satellitari di Esri; strade chiare di CARTO/OpenStreetMap. Per traffico massivo, usare un provider di tile di produzione.",

    dataStatusTitle: "Stato dei dati",
    officialSource: "Fonte ufficiale Copernicus EMSR884",
    activationCode: "Attivazione",
    aoiProduct: "Area / prodotto",
    copernicusDelivery: "Consegna Copernicus",
    satelliteAcquisition: "Immagine satellitare",
    lastChecked: "Ultimo controllo",
    lastSuccessfulLoad: "Ultimo caricamento riuscito",
    cacheStatus: "Cache",
    refreshData: "Aggiorna dati",
    dataFreshnessNote:
      "Questa dashboard controlla il manifesto ufficiale Copernicus al massimo ogni 30 minuti per browser. La consegna Copernicus indica quando Copernicus ha pubblicato il prodotto; l’ultimo controllo indica quando questa dashboard ha verificato la fonte ufficiale.",
    cacheLive: "Diretto",
    cacheFresh: "Cache recente",
    cacheStale: "Cache vecchia",
    newData: "Nuovo",
    recentData: "Recente",
    olderData: "Controllare data",
    notAvailable: "Non disponibile",
    legendTitle: "Legenda",
    possiblyDamaged: "Possibile danno",
    confirmedDamaged: "Danno / danno confermato",
    destroyed: "Distrutto",
    roads: "Strade / trasporti",
    notAnalysed: "Non analizzato / nuvole",

    dataTitle: "Chiarimento sui dati",
    dataText:
      "Le classi di danno sono valutazioni satellitari remote e possono richiedere verifica sul campo. Il giallo indica possibile danno, non distruzione confermata. Il tratteggio grigio indica un'area non analizzata perché la vista satellitare era ostruita o non disponibile.",

    source: "Fonte",
    unofficial:
      "Interfaccia non ufficiale di interesse pubblico. Non vengono raccolti dati su soccorsi o vittime.",

    builtBy: "Realizzato da YIN Renlong · Interfaccia non ufficiale di interesse pubblico basata su dati pubblici Copernicus EMSR884.",
    issueText: "Se trovi un problema, visita il progetto su GitHub.",
    footerCredit: "Interfaccia pubblica non ufficiale. Non vengono raccolti dati su soccorsi, vittime o persone scomparse. Se trovi un problema,",
    footerGithubLink: "visita il progetto su GitHub",
    footerAuthorPrefix: "Realizzato da",
    footerPeriod: ".",
    loadingTitle: "Caricamento dati satellitari",
    loadingText: "Recupero dei layer pubblici Copernicus EMSR884.",
    largeLayerLoadingTitle: "Caricamento di un layer geospaziale grande",
    largeLayerLoadingText: "Download di un layer Copernicus di grandi dimensioni. Il primo caricamento può richiedere tempo su connessioni lente; tornando a questa AOI nella stessa sessione del browser, i dati in cache verranno riutilizzati quando possibile.",
    loadedTitle: "Dati satellitari caricati",
    loadedText: "Layer pubblici caricati correttamente.",
    unavailableTitle: "Dati satellitari temporaneamente non disponibili",
    unavailableText:
      "Non è stato possibile caricare i layer pubblici Copernicus. Potrebbe essere un problema temporaneo, CORS o una modifica del manifesto dati.",
    retry: "Riprova",
  },

  zh: {
    eyebrow: "公共卫星仪表板",
    title: "2026 年委内瑞拉地震：地理空间影响仪表板（EMSR884）",
    subtitle: "Copernicus 卫星评估（分级评估与地表位移）的非官方界面。",
    mobileTitle: "2026 年委内瑞拉地震：地理空间影响仪表板（EMSR884）",

    safetyTitle: "公共安全提示",
    safetyText:
      "本仪表板仅供公众参考，不是官方救援、疏散或应急响应工具。请始终遵循当地主管部门的指示。",

    areasTitle: "关注区域",
    caracasStatus: "可用 — 卫星数据已开放",
    processing: "卫星数据处理中",
    otherCities: "其他 AOI",

    basemapTitle: "底图",
    satelliteBasemap: "卫星 + 街道",
    streetBasemap: "柔和 OSM",
    satelliteLabels: "在卫星图上显示街道名称",
    basemapNote:
      "原型：卫星影像来自 Esri；清晰街道地图来自 CARTO/OpenStreetMap。若访问量很大，应更换为生产级瓦片服务。",

    dataStatusTitle: "数据状态",
    officialSource: "Copernicus EMSR884 官方来源",
    activationCode: "激活编号",
    aoiProduct: "区域 / 产品",
    copernicusDelivery: "Copernicus 发布时间",
    satelliteAcquisition: "卫星影像时间",
    lastChecked: "上次检查",
    lastSuccessfulLoad: "仪表板成功加载时间",
    cacheStatus: "缓存",
    refreshData: "刷新数据",
    dataFreshnessNote:
      "本仪表板每个浏览器最多每 30 分钟检查一次 Copernicus 官方清单。Copernicus 发布时间表示官方发布产品的时间；上次检查表示本仪表板检查官方来源的时间。",
    cacheLive: "实时",
    cacheFresh: "新缓存",
    cacheStale: "旧缓存",
    newData: "新数据",
    recentData: "较新",
    olderData: "请检查日期",
    notAvailable: "不可用",
    legendTitle: "图例",
    possiblyDamaged: "可能受损",
    confirmedDamaged: "受损 / 已确认受损",
    destroyed: "已毁",
    roads: "道路 / 交通线",
    notAnalysed: "未分析 / 云层遮挡",

    dataTitle: "数据说明",
    dataText:
      "损毁等级来自卫星遥感评估，可能需要现场核实。黄色表示可能受损，不代表已确认毁坏。灰色斜线表示该区域因卫星视野受阻或数据不可用而未被分析。",

    source: "来源",
    unofficial: "非官方公益界面。不收集救援或伤亡数据。",

    builtBy: "由 YIN Renlong 构建 · 使用 Copernicus EMSR884 公共数据的非官方公益界面。",
    issueText: "如果发现问题，请访问 GitHub 项目。",
    footerCredit: "非官方公益界面。不收集救援、伤亡或失踪人员数据。如发现问题，请",
    footerGithubLink: "访问 GitHub 项目",
    footerAuthorPrefix: "构建者",
    footerPeriod: "。",
    loadingTitle: "正在加载卫星数据",
    loadingText: "正在获取 Copernicus EMSR884 公共图层。",
    largeLayerLoadingTitle: "正在加载大型地理空间图层",
    largeLayerLoadingText: "正在下载较大的 Copernicus 图层。首次加载在较慢网络下可能需要一些时间；在同一浏览器会话中再次打开该 AOI 时，将尽可能复用缓存数据。",
    loadedTitle: "卫星数据已加载",
    loadedText: "公共图层已成功加载。",
    unavailableTitle: "卫星数据暂时不可用",
    unavailableText:
      "无法加载 Copernicus 公共图层。可能是临时问题、CORS 限制或数据清单结构发生变化。",
    retry: "重试",
  },
};


/* Supplemental AOI translations: start */
const supplementalTranslations = {
  es: {
    aoiAvailable: "Disponible — capas de daño publicadas",
    aoiInProgress: "En progreso",
    aoiPlanned: "Planificado / esperando confirmación",
    aoiNotProduced: "No producido",
    aoiProcessing: "Esperando capas públicas",
    allProducts: "Todos los productos",
    aoiUnavailableTitle: "AOI aún sin capas públicas",
    aoiUnavailableText:
      "Copernicus ya listó esta AOI, pero las capas vectoriales públicas aún no están publicadas. El marcador se activará cuando Copernicus publique los datos.",

    builtUpGrading: "Evaluación de edificaciones",
    builtUpPoints: "Puntos de edificaciones",
    transportationGrading: "Red vial y ferroviaria",
    generalInformation: "Información general",
    basemapNoteButton: "Nota sobre el mapa base",
    productsTitle: "Productos",
    builtUpArea: "Área edificada",
    crisisPoints: "Puntos de crisis",
    blockedRoadInterruption: "Carretera bloqueada / interrupción",
    facilitiesArea: "Área de instalaciones",
    transportationArea: "Área de transporte",
    airfieldAndHeliportDamaged: "Aeródromo y helipuerto, dañado",
    sourceImagery: "Imagen fuente de Copernicus",
    sourceImageryLoadingTitle: "Cargando imagen fuente de Copernicus",
    sourceImageryLoadingText: "Preparando teselas de la imagen oficial. La imagen se carga bajo demanda y puede tardar en conexiones lentas.",
    sourceImageryLoadedTitle: "Imagen fuente cargada",
    sourceImageryLoadedText: "La imagen fuente de Copernicus está visible en el mapa.",
    sourceImageryErrorTitle: "No se pudo cargar la imagen fuente",
    sourceImageryErrorText: "El navegador no pudo leer esta imagen COG. Puede abrir el archivo TIFF desde el enlace de la leyenda.",
    sourceImageOnly: "Imagen fuente disponible",
    noDisplayableLayers: "No hay capas vectoriales visibles para el producto seleccionado.",
    groundMovementGrading: "Movimiento del terreno",
    groundMovementM: "Movimiento del terreno (m)",
    gmNegHigh: "-0.5 a -0.2",
    gmNegMedium: "-0.2 a -0.1",
    gmNegLow: "-0.1 a -0.05",
    gmNearZeroNeg: "-0.05 a 0",
    gmNearZeroPos: "0 a 0.05",
    gmPosLow: "0.05 a 0.1",
    gmPosMedium: "0.1 a 0.2",
    gmPosHigh: "0.2 a 0.5",
    gmAboveHigh: "Más de 0.5",
    highwayNoVisibleDamage: "Autopista, sin daño visible",
    mainRoadNoVisibleDamage: "Vía principal, sin daño visible",
    localRoadNoVisibleDamage: "Vía local, sin daño visible",
    trackNoVisibleDamage: "Camino / pista, sin daño visible",
    airfieldRunwayNoVisibleDamage: "Pista de aeródromo, sin daño visible",
    railwayNoVisibleDamage: "Ferrocarril / metro, sin daño visible",
    areaOfInterest: "Área de interés",
    collapseLegend: "Contraer leyenda",
    expandLegend: "Expandir leyenda",
  },

  en: {
    aoiAvailable: "Available — damage layers published",
    aoiInProgress: "In progress",
    aoiPlanned: "Planned / waiting confirmation",
    aoiNotProduced: "Not produced",
    aoiProcessing: "Waiting for public layers",
    allProducts: "All products",
    aoiUnavailableTitle: "AOI public layers not available yet",
    aoiUnavailableText:
      "Copernicus has listed this AOI, but public vector layers are not published yet. This placeholder will become active when Copernicus publishes the data.",

    builtUpGrading: "Built Up Grading",
    builtUpPoints: "Built Up Points",
    transportationGrading: "Road and rail network",
    generalInformation: "General Information",
    basemapNoteButton: "Basemap note",
    productsTitle: "Products",
    builtUpArea: "Built Up Area",
    crisisPoints: "Crisis Points",
    blockedRoadInterruption: "Blocked road / interruption",
    facilitiesArea: "Facilities Area",
    transportationArea: "Transportation Area",
    airfieldAndHeliportDamaged: "Airfield and Heliport, Damaged",
    sourceImagery: "Copernicus source imagery",
    sourceImageryLoadingTitle: "Loading Copernicus source image",
    sourceImageryLoadingText: "Preparing official image tiles. The image loads on demand and may take time on slower connections.",
    sourceImageryLoadedTitle: "Source image loaded",
    sourceImageryLoadedText: "The Copernicus source image is visible on the map.",
    sourceImageryErrorTitle: "Could not load source image",
    sourceImageryErrorText: "The browser could not read this COG image. You can open the TIFF file from the legend link.",
    sourceImageOnly: "Source image available",
    noDisplayableLayers: "No visible vector layers are available for the selected product.",
    groundMovementGrading: "Ground Movement",
    groundMovementM: "Ground Movement (m)",
    gmNegHigh: "-0.5 to -0.2",
    gmNegMedium: "-0.2 to -0.1",
    gmNegLow: "-0.1 to -0.05",
    gmNearZeroNeg: "-0.05 to 0",
    gmNearZeroPos: "0 to 0.05",
    gmPosLow: "0.05 to 0.1",
    gmPosMedium: "0.1 to 0.2",
    gmPosHigh: "0.2 to 0.5",
    gmAboveHigh: "Above 0.5",
    highwayNoVisibleDamage: "Highway, No visible damage",
    mainRoadNoVisibleDamage: "Main road, No visible damage",
    localRoadNoVisibleDamage: "Local road, No visible damage",
    trackNoVisibleDamage: "Track, No visible damage",
    airfieldRunwayNoVisibleDamage: "Airfield runway, No visible damage",
    railwayNoVisibleDamage: "Railway / subway, No visible damage",
    areaOfInterest: "Area of Interest",
    collapseLegend: "Collapse legend",
    expandLegend: "Expand legend",
  },

  it: {
    aoiAvailable: "Disponibile — layer di danno pubblicati",
    aoiInProgress: "In corso",
    aoiPlanned: "Pianificato / in attesa di conferma",
    aoiNotProduced: "Non prodotto",
    aoiProcessing: "In attesa dei layer pubblici",
    allProducts: "Tutti i prodotti",
    aoiUnavailableTitle: "Layer pubblici AOI non ancora disponibili",
    aoiUnavailableText:
      "Copernicus ha elencato questa AOI, ma i layer vettoriali pubblici non sono ancora pubblicati. Il segnaposto si attiverà quando Copernicus pubblicherà i dati.",

    builtUpGrading: "Valutazione edifici",
    builtUpPoints: "Punti edificati",
    transportationGrading: "Rete stradale e ferroviaria",
    generalInformation: "Informazioni generali",
    basemapNoteButton: "Nota sulla mappa base",
    productsTitle: "Prodotti",
    builtUpArea: "Area edificata",
    crisisPoints: "Punti di crisi",
    blockedRoadInterruption: "Strada bloccata / interruzione",
    facilitiesArea: "Area delle strutture",
    transportationArea: "Area di trasporto",
    airfieldAndHeliportDamaged: "Aeroporto ed eliporto, danneggiato",
    sourceImagery: "Immagine sorgente Copernicus",
    sourceImageryLoadingTitle: "Caricamento immagine sorgente Copernicus",
    sourceImageryLoadingText: "Preparazione delle tile dell’immagine ufficiale. L’immagine viene caricata su richiesta e può richiedere tempo su connessioni lente.",
    sourceImageryLoadedTitle: "Immagine sorgente caricata",
    sourceImageryLoadedText: "L’immagine sorgente Copernicus è visibile sulla mappa.",
    sourceImageryErrorTitle: "Impossibile caricare l’immagine sorgente",
    sourceImageryErrorText: "Il browser non ha potuto leggere questa immagine COG. Puoi aprire il file TIFF dal link nella legenda.",
    sourceImageOnly: "Immagine sorgente disponibile",
    noDisplayableLayers: "Non sono disponibili layer vettoriali visibili per il prodotto selezionato.",
    groundMovementGrading: "Movimento del suolo",
    groundMovementM: "Movimento del suolo (m)",
    gmNegHigh: "-0.5 a -0.2",
    gmNegMedium: "-0.2 a -0.1",
    gmNegLow: "-0.1 a -0.05",
    gmNearZeroNeg: "-0.05 a 0",
    gmNearZeroPos: "0 a 0.05",
    gmPosLow: "0.05 a 0.1",
    gmPosMedium: "0.1 a 0.2",
    gmPosHigh: "0.2 a 0.5",
    gmAboveHigh: "Oltre 0.5",
    highwayNoVisibleDamage: "Autostrada, nessun danno visibile",
    mainRoadNoVisibleDamage: "Strada principale, nessun danno visibile",
    localRoadNoVisibleDamage: "Strada locale, nessun danno visibile",
    trackNoVisibleDamage: "Pista / sentiero, nessun danno visibile",
    airfieldRunwayNoVisibleDamage: "Pista aeroportuale, nessun danno visibile",
    railwayNoVisibleDamage: "Ferrovia / metro, nessun danno visibile",
    areaOfInterest: "Area di interesse",
    collapseLegend: "Comprimi legenda",
    expandLegend: "Espandi legenda",
  },

  zh: {
    aoiAvailable: "可用 — 损毁图层已发布",
    aoiInProgress: "处理中",
    aoiPlanned: "已计划 / 等待确认",
    aoiNotProduced: "未生产",
    aoiProcessing: "等待公共图层",
    allProducts: "全部产品",
    aoiUnavailableTitle: "该 AOI 公共图层尚不可用",
    aoiUnavailableText:
      "Copernicus 已列出该 AOI，但公共矢量图层尚未发布。Copernicus 发布数据后，此占位项会自动变为可用。",

    builtUpGrading: "建筑物评估",
    builtUpPoints: "建筑物点",
    transportationGrading: "道路与铁路网络",
    generalInformation: "一般信息",
    basemapNoteButton: "底图说明",
    productsTitle: "产品",
    builtUpArea: "建筑物面",
    crisisPoints: "危机点",
    blockedRoadInterruption: "道路阻断 / 中断",
    facilitiesArea: "设施面",
    transportationArea: "交通设施面",
    airfieldAndHeliportDamaged: "机场与直升机场，受损",
    sourceImagery: "Copernicus 源影像",
    sourceImageryLoadingTitle: "正在加载 Copernicus 源影像",
    sourceImageryLoadingText: "正在准备官方影像瓦片。影像按需加载，在较慢网络下可能需要一些时间。",
    sourceImageryLoadedTitle: "源影像已加载",
    sourceImageryLoadedText: "Copernicus 源影像已显示在地图上。",
    sourceImageryErrorTitle: "无法加载源影像",
    sourceImageryErrorText: "浏览器无法读取该 COG 影像。您仍可通过图例中的链接打开 TIFF 文件。",
    sourceImageOnly: "源影像可用",
    noDisplayableLayers: "所选产品没有可显示的矢量图层。",
    groundMovementGrading: "地表位移",
    groundMovementM: "地表位移（米）",
    gmNegHigh: "-0.5 至 -0.2",
    gmNegMedium: "-0.2 至 -0.1",
    gmNegLow: "-0.1 至 -0.05",
    gmNearZeroNeg: "-0.05 至 0",
    gmNearZeroPos: "0 至 0.05",
    gmPosLow: "0.05 至 0.1",
    gmPosMedium: "0.1 至 0.2",
    gmPosHigh: "0.2 至 0.5",
    gmAboveHigh: "大于 0.5",
    highwayNoVisibleDamage: "高速路，无可见损毁",
    mainRoadNoVisibleDamage: "主干道，无可见损毁",
    localRoadNoVisibleDamage: "本地道路，无可见损毁",
    trackNoVisibleDamage: "小路 / 便道，无可见损毁",
    airfieldRunwayNoVisibleDamage: "机场跑道，无可见损毁",
    railwayNoVisibleDamage: "铁路 / 地铁，无可见损毁",
    areaOfInterest: "关注区域",
    collapseLegend: "收起图例",
    expandLegend: "展开图例",
  },
};
/* Supplemental AOI translations: end */

let currentLang = "es";
let currentBasemap = "satellite";
let satelliteLabelsEnabled = true;
let map;
let mapReady = false;
let isLoading = false;

const layerVisibility = {
  possible: true,
  damaged: true,
  destroyed: true,
  roads: true,
  notAnalysed: false,
  groundNegHigh: true,
  groundNegMedium: true,
  groundNegLow: true,
  groundNearZeroNeg: true,
  groundNearZeroPos: true,
  groundPosLow: true,
  groundPosMedium: true,
  groundPosHigh: true,
  groundAboveHigh: true,
  aoi: true,  transportHighway: true,
  transportMain: true,
  transportLocal: true,
  transportTrack: true,
  transportAirfieldRunway: true,
  transportRailway: true,

};


function getLayerVisibility(key, defaultValue = true) {
  if (!Object.prototype.hasOwnProperty.call(layerVisibility, key)) {
    layerVisibility[key] = defaultValue !== false;
  }

  return layerVisibility[key] !== false;
}

function setLayerVisibilityState(key, value) {
  layerVisibility[key] = Boolean(value);
}

const loadedSourceMeta = {};
let latestDataStatusMeta = {};
let latestSelectedProductInfo = null;
const els = {};

document.addEventListener("DOMContentLoaded", () => {
  els.status = document.getElementById("map-status");
  els.statusTitle = document.getElementById("status-title");
  els.statusMessage = document.getElementById("status-message");
  els.retry = document.getElementById("retry-btn");
  els.labelsToggle = document.getElementById("satellite-labels-toggle");
  els.aoiList = document.getElementById("aoi-list");
  els.productPanel = document.getElementById("product-selector-panel");
  els.productList = document.getElementById("product-list");

  els.dataProduct = document.getElementById("data-product");
  els.dataDelivery = document.getElementById("data-delivery");
  els.dataAcquisition = document.getElementById("data-acquisition");
  els.dataLastChecked = document.getElementById("data-last-checked");
  els.dataSuccessfulLoad = document.getElementById("data-successful-load");
  els.dataCacheStatus = document.getElementById("data-cache-status");
  els.dataFreshnessBadge = document.getElementById("data-freshness-badge");
  els.dataReportLink = document.getElementById("data-report-link");
  els.dataDownloadLink = document.getElementById("data-download-link");

  setupLanguageButtons();
  setupUiEvents();
  setupBasemapEvents();
  setupLayerToggleEvents();
  setupLegendOverlayEvents();

  applyLanguage(currentLang);
  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  waitForMapLibreThenInit();
});

function waitForMapLibreThenInit() {
  if (window.maplibregl) {
    initMap();
    return;
  }

  setTimeout(waitForMapLibreThenInit, 50);
}

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: createMapStyle(),
    center: CARACAS.center,
    zoom: CARACAS.zoom,
    pitch: CARACAS.pitch,
    bearing: CARACAS.bearing,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");

  map.on("load", async () => {
    mapReady = true;
    addHatchPattern();
    setBasemap(currentBasemap);
    await loadAoi(selectedAoiNumber);
  });

  map.on("error", (event) => {
    console.warn("MapLibre map error:", event?.error || event);
  });
}

function createMapStyle() {
  return {
    version: 8,
    name: "Prototype satellite and OSM basemaps",
    sources: {
      "esri-world-imagery": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          'Satellite imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      },

      "osm-streets": {
        type: "raster",
        tiles: [
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
      },

      "carto-dark-labels": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://d.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors',
      },
    },

    layers: [
      {
        id: BASE_LAYER_IDS.satellite,
        type: "raster",
        source: "esri-world-imagery",
        layout: { visibility: "visible" },
        paint: {
          "raster-opacity": 0.9,
          "raster-saturation": -0.12,
          "raster-contrast": 0.12,
          "raster-brightness-max": 0.72,
        },
      },

      {
        id: BASE_LAYER_IDS.street,
        type: "raster",
        source: "osm-streets",
        layout: { visibility: "none" },
        paint: {
          "raster-opacity": 0.94,
          "raster-saturation": -0.5,
          "raster-contrast": -0.06,
        },
      },

      {
        id: BASE_LAYER_IDS.labels,
        type: "raster",
        source: "carto-dark-labels",
        layout: { visibility: "visible" },
        paint: {
          "raster-opacity": 0.9,
        },
      },
    ],
  };
}

function setupLanguageButtons() {
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.addEventListener("click", () => {
      currentLang = button.dataset.lang || "es";
      applyLanguage(currentLang);
    });
  });
}

function setupUiEvents() {
  const oldCaracasButton = document.getElementById("load-caracas");

  if (oldCaracasButton) {
    oldCaracasButton.addEventListener("click", () => {
      selectedAoiNumber = 2;
      selectedProductKey = "";
      updateAoiUrlParam(2);
      clearSelectedProductUrlParam();
      closeMobileSidebar();
      loadAoi(2);
    });
  }

  if (els.aoiList) {
    els.aoiList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-aoi-number]");
      if (!button) return;

      const aoiNumber = Number(button.dataset.aoiNumber);

      if (!Number.isFinite(aoiNumber)) {
        return;
      }

      selectedAoiNumber = aoiNumber;
      selectedProductKey = "";
      updateAoiUrlParam(aoiNumber);
      clearSelectedProductUrlParam();
      closeMobileSidebar();
      loadAoi(aoiNumber);
    });
  }

  if (els.productList) {
    els.productList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-product-key]");
      if (!button) return;

      const nextProductKey = String(button.dataset.productKey || "").trim();
      if (!nextProductKey) return;

      selectedProductKey = nextProductKey;
      updateSelectedProductUrlParam(nextProductKey);
      loadAoi(selectedAoiNumber);
    });
  }

  const sidebarToggle = document.getElementById("sidebar-toggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });
  }

  if (els.retry) {
    els.retry.addEventListener("click", () => {
      loadAoi(selectedAoiNumber);
    });
  }

  const refreshDataButton = document.getElementById("refresh-data-btn");
  if (refreshDataButton) {
    refreshDataButton.addEventListener("click", forceRefreshCopernicusData);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileSidebar();
    }
  });
}

function setupBasemapEvents() {
  document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.addEventListener("click", () => {
      setBasemap(button.dataset.basemap || "satellite");
    });
  });

  els.labelsToggle.addEventListener("change", (event) => {
    satelliteLabelsEnabled = event.target.checked;
    setBasemap(currentBasemap);
  });
}

function setupLayerToggleEvents() {
  const legend = document.getElementById("map-legend");

  if (!legend || legend.dataset.toggleDelegated === "1") {
    return;
  }

  legend.dataset.toggleDelegated = "1";

  legend.addEventListener("change", (event) => {
    const input = event.target.closest("[data-layer-toggle]");

    if (!input) {
      return;
    }

    const key = String(input.dataset.layerToggle || "").trim();

    if (!key) {
      return;
    }

    setLayerVisibilityState(key, input.checked);
    syncLayerToggleInputs();
    applyLayerVisibility();
  });

  syncLayerToggleInputs();
}

function syncLayerToggleInputs() {
  document.querySelectorAll("[data-layer-toggle]").forEach((input) => {
    const key = String(input.dataset.layerToggle || "").trim();

    if (!key) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(layerVisibility, key)) {
      layerVisibility[key] = Boolean(input.checked);
    }

    const checked = Boolean(layerVisibility[key]);
    input.checked = checked;
    input.closest(".legend-toggle")?.classList.toggle("off", !checked);
  });
}

function setupLegendOverlayEvents() {
  const legend = document.getElementById("map-legend");
  const button = document.getElementById("legend-collapse-btn");

  if (!legend || !button) {
    return;
  }

  button.addEventListener("click", () => {
    const collapsed = legend.classList.toggle("collapsed");

    button.textContent = collapsed ? "+" : "−";
    button.setAttribute(
      "aria-label",
      collapsed ? t("expandLegend") : t("collapseLegend")
    );
  });
}


function closeMobileSidebar() {
  document.body.classList.remove("sidebar-open");
}

function applyLanguage(lang) {
  const dictionary = translations[lang] || translations.es;
  const supplemental = supplementalTranslations[lang] || supplementalTranslations.es || {};

  document.documentElement.lang = lang === "zh" ? "zh" : lang;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    const value = dictionary[key] || supplemental[key];

    if (value) {
      node.textContent = value;
    }
  });

  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });

  const legend = document.getElementById("map-legend");
  const legendButton = document.getElementById("legend-collapse-btn");

  if (legendButton) {
    const collapsed = Boolean(legend?.classList.contains("collapsed"));
    legendButton.textContent = collapsed ? "+" : "−";
    legendButton.setAttribute(
      "aria-label",
      collapsed ? t("expandLegend") : t("collapseLegend")
    );
  }

  renderDataStatusPanel();

  if (latestAois.length && typeof renderAoiList === "function") {
    renderAoiList(latestAois);
  }

  if (currentProductOptions.length && typeof renderProductSelector === "function") {
    renderProductSelector(currentProductOptions, latestSelectedProductInfo?.product || null);
  }

  if (latestSelectedProductInfo && typeof renderDynamicLegend === "function") {
    renderDynamicLegend(latestSelectedProductInfo);
  }
}

function t(key) {
  const dictionary = translations[currentLang] || translations.es;
  const supplemental = supplementalTranslations[currentLang] || supplementalTranslations.es || {};

  return (
    dictionary[key] ||
    supplemental[key] ||
    (supplementalTranslations.es && supplementalTranslations.es[key]) ||
    key
  );
}

function setBasemap(mode) {
  currentBasemap = mode === "street" ? "street" : "satellite";

  document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.classList.toggle("active", button.dataset.basemap === currentBasemap);
  });

  if (els.labelsToggle) {
    els.labelsToggle.disabled = currentBasemap !== "satellite";
  }

  if (!mapReady) {
    applyLayerVisibility();
    return;
  }

  setLayerVisibility(BASE_LAYER_IDS.satellite, currentBasemap === "satellite");
  setLayerVisibility(BASE_LAYER_IDS.street, currentBasemap === "street");

  const showLabels = currentBasemap === "satellite" && satelliteLabelsEnabled;
  setLayerVisibility(BASE_LAYER_IDS.labels, showLabels);

  moveLabelsToTop();
  applyLayerVisibility();
}

function setLayerVisibility(layerId, visible) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

async function loadCaracas() {
  selectedAoiNumber = 2;
  updateAoiUrlParam(2);
  return loadAoi(2);
}

async function loadAoi(aoiNumber = selectedAoiNumber) {
  if (!mapReady || isLoading) return;

  const nextAoiNumber = Number(aoiNumber);
  selectedAoiNumber = Number.isFinite(nextAoiNumber)
    ? nextAoiNumber
    : DEFAULT_AOI_NUMBER;

  isLoading = true;

  latestDataStatusMeta = {};
  latestSelectedProductInfo = null;
  renderDataStatusPanel();

  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  try {
    clearCopernicusDataLayers();

    const info = await getCopernicusLayerInfo(selectedAoiNumber);
    latestSelectedProductInfo = info;

    const urls = info.urls || {};

    renderAoiList(latestAois);
    renderProductSelector(info.productOptions || [], info.product || null);
    fitAoiExtent(info.aoi);
    showAoiExtent(info.aoi);

    const layerJobs = [
      ["notAnalysedA", urls.notAnalysedA],
      ["groundMovementA", urls.groundMovementA],
      ["transportationA", urls.transportationA],
      ["facilitiesA", urls.facilitiesA],
      ["builtUpA", urls.builtUpA],
      ["builtUpP", urls.builtUpP],
      ["ancillaryCrisisInfoP", urls.ancillaryCrisisInfoP],
      ["transportationL", urls.transportationL],
    ].filter((item) => Boolean(item[1]));

    const results = [];

    for (const [kind, url] of layerJobs) {
      try {
        const value = await addCopernicusLayer(kind, url);
        results.push({ status: "fulfilled", value, kind });
      } catch (error) {
        console.warn(`Layer ${kind} failed:`, error);
        results.push({ status: "rejected", reason: error, kind });
      }
    }

    const loadedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value === true
    ).length;

    showAoiExtent(info.aoi);
    moveLabelsToTop();
    renderDynamicLegend(info);
    applyLayerVisibility();

    if (loadedCount === 0) {
      console.warn("Copernicus layer load results:", results);

      setStatus(
        "error",
        t("aoiUnavailableTitle"),
        `${formatAoiLabel(info.aoi)} · ${info.product ? getProductLabel(info.product) : ""} — ${t("aoiUnavailableText")}`,
        false
      );

      updateDataStatusPanel({
        successfulLoadTime: "",
        loadedLayerCount: 0,
      });

      return;
    }

    updateDataStatusPanel({
      successfulLoadTime: new Date().toISOString(),
      loadedLayerCount: loadedCount,
    });

    renderAoiList(latestAois);
    renderProductSelector(info.productOptions || [], info.product || null);

    setStatus(
      "success",
      t("loadedTitle"),
      `${formatAoiLabel(info.aoi)} · ${getProductLabel(info.product)} — ${t("loadedText")}`,
      false
    );

    window.setTimeout(() => {
      if (els.status.classList.contains("success")) {
        els.status.classList.add("hidden");
      }
    }, 5500);
  } catch (error) {
    console.error(error);

    setStatus(
      "error",
      t("unavailableTitle"),
      `${t("unavailableText")}${error.message ? ` (${error.message})` : ""}`,
      true
    );
  } finally {
    isLoading = false;
  }
}

async function getCopernicusLayerUrls() {
  const info = await getCopernicusLayerInfo(selectedAoiNumber);
  return info.urls || {};
}

function findCaracasAoi(manifest) {
  return findAoiByNumber(manifest, 2);
}

function chooseCaracasProduct(aoi) {
  return chooseAoiProduct(aoi);
}

function extractLayerUrlsFromProduct(product) {
  const urls = {};

  for (const layer of product?.layers || []) {
    const jsonUrl = String(layer.json || "").trim();

    if (!jsonUrl.startsWith("http")) {
      continue;
    }

    const key = classifyLayer(`${layer.name || ""} ${jsonUrl}`);

    if (key && !urls[key]) {
      urls[key] = jsonUrl;
    }
  }

  return urls;
}

function cleanOverrideUrls(overrides) {
  const cleaned = {};

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string" && value.trim().startsWith("http")) {
      cleaned[key] = value.trim();
    }
  }

  return cleaned;
}

async function addCopernicusLayer(kind, url) {
  maybeShowLargeLayerDownloadNotice(kind, url);

  const meta = await ensureCopernicusSource(kind, url);

  if (kind === "builtUpA") {
    addBuiltUpStyleLayers(meta);
  } else if (kind === "builtUpP") {
    addBuiltUpPointStyleLayers(meta);
  } else if (kind === "transportationL") {
    addTransportationStyleLayer(meta);
  } else if (kind === "transportationA") {
    addTransportationAreaStyleLayers(meta);
  } else if (kind === "facilitiesA") {
    addFacilitiesAreaStyleLayers(meta);
  } else if (kind === "ancillaryCrisisInfoP") {
    addAncillaryCrisisInfoStyleLayers(meta);
  } else if (kind === "notAnalysedA") {
    addNotAnalysedStyleLayers(meta);
  } else if (kind === "groundMovementA") {
    addGroundMovementStyleLayers(meta);
  } else {
    throw new Error(`Unknown Copernicus layer kind: ${kind}`);
  }

  applyLayerVisibility();

  console.info(`Added Copernicus layer ${kind}:`, meta);
  return true;
}

async function ensureCopernicusSource(kind, url) {
  const sourceId = SOURCE_IDS[kind];

  if (map.getSource(sourceId) && loadedSourceMeta[sourceId]) {
    return loadedSourceMeta[sourceId];
  }

  const json = await fetchJsonDocument(url, `${kind} Copernicus JSON`, {
    cacheDocument: true,
    fetchCache: "force-cache",
  });

  console.info(`Fetched ${kind} JSON summary:`, summarizeJson(json, url));

  if (isGeoJson(json)) {
    const geojson = normalizeGeoJson(json);
    const featureSummary = summarizeLayerFeatures(kind, geojson.features || []);

    map.addSource(sourceId, {
      type: "geojson",
      data: geojson,
      generateId: true,
    });

    loadedSourceMeta[sourceId] = {
      kind,
      sourceId,
      sourceType: "geojson",
      sourceLayer: null,
      url,
      featureCount: Array.isArray(geojson.features) ? geojson.features.length : null,
      ...featureSummary,
    };

    return loadedSourceMeta[sourceId];
  }

  if (isTileJson(json)) {
    const tiles = Array.isArray(json.tiles)
      ? json.tiles.map((tile) => resolveTileUrl(tile, url))
      : [];

    if (!tiles.length) {
      throw new Error(
        `${kind}: JSON looks like TileJSON but has no tiles[] array. Keys: ${Object.keys(
          json
        ).join(", ")}`
      );
    }

    const sourceLayer = detectVectorSourceLayer(json, kind, url);

    if (!sourceLayer) {
      throw new Error(`${kind}: Could not detect vector source-layer from TileJSON.`);
    }

    const sourceDefinition = {
      type: "vector",
      tiles,
    };

    const minzoom = Number(json.minzoom);
    const maxzoom = Number(json.maxzoom);

    if (Number.isFinite(minzoom)) sourceDefinition.minzoom = minzoom;
    if (Number.isFinite(maxzoom)) sourceDefinition.maxzoom = maxzoom;
    if (json.scheme) sourceDefinition.scheme = json.scheme;

    if (Array.isArray(json.bounds) && json.bounds.length === 4) {
      sourceDefinition.bounds = json.bounds;
    }

    if (json.attribution) {
      sourceDefinition.attribution = json.attribution;
    }

    map.addSource(sourceId, sourceDefinition);

    loadedSourceMeta[sourceId] = {
      kind,
      sourceId,
      sourceType: "vector",
      sourceLayer,
      url,
      tiles,
      tileJsonKeys: Object.keys(json),
    };

    return loadedSourceMeta[sourceId];
  }

  throw new Error(
    `${kind}: Unsupported Copernicus JSON. It is neither GeoJSON nor TileJSON. Keys: ${Object.keys(
      json || {}
    ).join(", ")}`
  );
}


function clearForceRefreshUrlParam() {
  if (!COPERNICUS_FORCE_REFRESH || !window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("refresh");
  url.searchParams.delete("forceRefresh");
  url.searchParams.delete("nocache");

  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

async function getCachedCopernicusManifest() {
  const now = Date.now();
  const cached = readCachedManifest();

  if (!COPERNICUS_FORCE_REFRESH && cached && cached.expiresAt > now) {
    return {
      manifest: cached.manifest,
      checkedAt: cached.checkedAt,
      fromCache: true,
      stale: false,
      cacheAgeMs: now - new Date(cached.checkedAt).getTime(),
    };
  }

  try {
    const manifest = await fetchJsonDocument(COPERNICUS_API_URL, "Copernicus manifest");
    const checkedAt = new Date().toISOString();

    writeCachedManifest({
      manifest,
      checkedAt,
      expiresAt: now + COPERNICUS_CACHE_TTL_MS,
    });

    clearForceRefreshUrlParam();

    return {
      manifest,
      checkedAt,
      fromCache: false,
      stale: false,
      cacheAgeMs: 0,
    };
  } catch (error) {
    if (cached) {
      console.warn("Using stale cached Copernicus manifest because live fetch failed:", error);

      return {
        manifest: cached.manifest,
        checkedAt: cached.checkedAt,
        fromCache: true,
        stale: true,
        cacheAgeMs: now - new Date(cached.checkedAt).getTime(),
      };
    }

    throw error;
  }
}

function readCachedManifest() {
  try {
    const raw = window.localStorage.getItem(COPERNICUS_MANIFEST_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed || !parsed.manifest || !parsed.checkedAt || !parsed.expiresAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeCachedManifest(payload) {
  try {
    window.localStorage.setItem(COPERNICUS_MANIFEST_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Could not write Copernicus manifest cache:", error);
  }
}

function forceRefreshCopernicusData() {
  try {
    window.localStorage.removeItem(COPERNICUS_MANIFEST_CACHE_KEY);
  } catch {
    // Ignore localStorage errors.
  }

  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  // Reload is the cleanest way to force MapLibre sources/layers to be recreated.
  window.location.reload();
}

function getLatestAcquisitionTime(product) {
  const times = (product.images || [])
    .map((image) => image.acquisitionTime)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!times.length) {
    return "";
  }

  return new Date(Math.max(...times)).toISOString();
}

function updateDataStatusPanel(partial) {
  latestDataStatusMeta = {
    ...latestDataStatusMeta,
    ...partial,
  };

  renderDataStatusPanel();
}

function renderDataStatusPanel() {
  if (!els.dataProduct) {
    return;
  }

  const meta = latestDataStatusMeta || {};

  const aoiText = meta.aoiName
    ? `${meta.aoiName} AOI${String(meta.aoiNumber ?? "").padStart(2, "0")}`
    : "AOI";

  const productParts = [aoiText];

  if (meta.productSummary) {
    productParts.push(meta.productSummary);
  } else {
    if (meta.productType) productParts.push(meta.productType);
  }

  if (meta.productId) productParts.push(`#${meta.productId}`);
  if (meta.productStatus) productParts.push(`status ${meta.productStatus}`);

  setNodeText(els.dataProduct, productParts.join(" · "));
  setNodeText(els.dataDelivery, formatDateTime(meta.deliveryTime || meta.expectedDelivery));
  setNodeText(els.dataAcquisition, formatDateTime(meta.acquisitionTime));
  setNodeText(els.dataLastChecked, formatDateTime(meta.lastChecked));
  setNodeText(els.dataSuccessfulLoad, formatDateTime(meta.successfulLoadTime));
  setNodeText(els.dataCacheStatus, formatCacheStatus(meta));

  if (els.dataReportLink && meta.reportLink) {
    els.dataReportLink.href = meta.reportLink;
    els.dataReportLink.classList.remove("hidden");
  }

  if (els.dataDownloadLink) {
    const downloadUrl = meta.downloadPath || meta.productsPath || "";

    if (downloadUrl) {
      els.dataDownloadLink.href = downloadUrl;
      els.dataDownloadLink.classList.remove("hidden");
      els.dataDownloadLink.textContent = "ZIP";
    } else {
      els.dataDownloadLink.classList.add("hidden");
    }
  }

  renderFreshnessBadge(meta);
}

function setNodeText(node, value) {
  if (!node) return;
  node.textContent = value || "—";
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }

  const locale =
    currentLang === "zh"
      ? "zh-CN"
      : currentLang === "it"
        ? "it-IT"
        : currentLang === "es"
          ? "es-ES"
          : "en-GB";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

function formatCacheStatus(meta) {
  if (!meta.lastChecked) {
    return "—";
  }

  if (meta.cacheStale) {
    return t("cacheStale");
  }

  if (meta.fromCache) {
    return t("cacheFresh");
  }

  return t("cacheLive");
}

function renderFreshnessBadge(meta) {
  if (!els.dataFreshnessBadge) {
    return;
  }

  const delivery = meta.deliveryTime || meta.expectedDelivery || meta.acquisitionTime;

  if (!delivery) {
    els.dataFreshnessBadge.textContent = t("notAvailable");
    els.dataFreshnessBadge.className = "freshness-badge neutral";
    return;
  }

  const ageMs = Date.now() - new Date(delivery).getTime();

  if (!Number.isFinite(ageMs)) {
    els.dataFreshnessBadge.textContent = t("notAvailable");
    els.dataFreshnessBadge.className = "freshness-badge neutral";
    return;
  }

  const hours = ageMs / 36e5;

  if (meta.cacheStale) {
    els.dataFreshnessBadge.textContent = `${t("cacheStale")} · ${Math.round(hours)}h`;
    els.dataFreshnessBadge.className = "freshness-badge stale";
    return;
  }

  if (hours <= 6) {
    els.dataFreshnessBadge.textContent = `${t("newData")} · ${Math.max(0, Math.round(hours))}h`;
    els.dataFreshnessBadge.className = "freshness-badge fresh";
    return;
  }

  if (hours <= 24) {
    els.dataFreshnessBadge.textContent = `${t("recentData")} · ${Math.round(hours)}h`;
    els.dataFreshnessBadge.className = "freshness-badge recent";
    return;
  }

  els.dataFreshnessBadge.textContent = `${t("olderData")} · ${Math.round(hours / 24)}d`;
  els.dataFreshnessBadge.className = "freshness-badge old";
}

/* AOI dynamic helpers: start */
async function getCopernicusLayerInfo(aoiNumber = selectedAoiNumber) {
  const overrides = cleanOverrideUrls(COPERNICUS_URL_OVERRIDES);

  const manifestInfo = await getCachedCopernicusManifest();
  const manifest = manifestInfo.manifest;

  latestAois = getAllAois(manifest);
  renderAoiList(latestAois);

  const aoi = findAoiByNumber(manifest, aoiNumber);

  if (!aoi) {
    throw new Error(
      `AOI${String(aoiNumber).padStart(2, "0")} not found in EMSR884 manifest.`
    );
  }

  const productOptions = getProductsSortedForAoi(aoi);
  const product = chooseSelectedProductForAoi(aoi, productOptions);

  if (!product) {
    updateDataStatusPanel({
      activationCode: "EMSR884",
      aoiName: aoi.name || `AOI${String(aoi.number).padStart(2, "0")}`,
      aoiNumber: aoi.number,
      lastChecked: manifestInfo.checkedAt,
      fromCache: manifestInfo.fromCache,
      cacheStale: manifestInfo.stale,
      cacheAgeMs: manifestInfo.cacheAgeMs,
      reportLink: manifest?.results?.[0]?.reportLink || "",
      productsPath: manifest?.results?.[0]?.productsPath || "",
    });

    return {
      manifest,
      manifestInfo,
      aoi,
      product: null,
      products: [],
      productOptions,
      urls: {},
      cogLayers: [],
    };
  }

  selectedProductKey = getProductKey(product);

  const structuredUrls = extractLayerUrlsFromProduct(product);
  const urls = {
    ...structuredUrls,
    ...overrides,
  };

  const cogLayers = extractCogLayersFromProduct(product, manifest);

  updateDataStatusPanel({
    activationCode: "EMSR884",
    aoiName: aoi.name || `AOI${String(aoi.number).padStart(2, "0")}`,
    aoiNumber: aoi.number,

    productId: product?.id || "",
    productType: product?.type || "",
    productStatus: product?.version?.statusCode || "",
    productSummary: getProductLabel(product),

    deliveryTime: product?.version?.deliveryTime || "",
    expectedDelivery: product?.expectedDelivery || "",
    acquisitionTime: getLatestAcquisitionTime(product),

    lastChecked: manifestInfo.checkedAt,
    fromCache: manifestInfo.fromCache,
    cacheStale: manifestInfo.stale,
    cacheAgeMs: manifestInfo.cacheAgeMs,
    reportLink: manifest?.results?.[0]?.reportLink || "",
    productsPath: manifest?.results?.[0]?.productsPath || "",
    downloadPath: product?.downloadPath || "",
  });

  renderProductSelector(productOptions, product);

  console.info("Selected Copernicus AOI/product/layers:", {
    aoiName: aoi.name,
    aoiNumber: aoi.number,
    product: {
      id: product.id,
      type: product.type,
      monitoring: product.monitoring,
      monitoringNumber: product.monitoringNumber,
      status: product.version?.statusCode,
    },
    urls,
    cogLayers,
  });

  return {
    manifest,
    manifestInfo,
    aoi,
    product,
    products: [product],
    productOptions,
    urls,
    cogLayers,
  };
}

function getAllAois(manifest) {
  const aois = [];

  for (const result of manifest?.results || []) {
    if (Array.isArray(result.aois)) {
      aois.push(...result.aois);
    }
  }

  return aois.sort((a, b) => Number(a.number) - Number(b.number));
}

function findAoiByNumber(manifest, aoiNumber) {
  const wanted = Number(aoiNumber);

  return getAllAois(manifest).find((aoi) => Number(aoi.number) === wanted) || null;
}

function productLayerKeys(product) {
  return new Set(Object.keys(extractLayerUrlsFromProduct(product || {})));
}

function productHasLayerKey(product, key) {
  return Boolean(extractLayerUrlsFromProduct(product || {})[key]);
}

function productHasUsefulLayers(product) {
  return productLayerKeys(product).size > 0;
}

function productStatusScore(product) {
  const status = product?.version?.statusCode || "";

  if (status === "F") return 1000;
  if (status === "I") return 160;
  if (status === "W") return 80;
  if (status === "N") return -500;

  return 0;
}

function getProductTimeMillis(product) {
  const imageTimes = (product?.images || [])
    .map((image) => new Date(image.acquisitionTime || "").getTime())
    .filter((value) => Number.isFinite(value));

  const times = [
    product?.version?.deliveryTime,
    product?.expectedDelivery,
    ...imageTimes.map((value) => new Date(value).toISOString()),
  ]
    .map((value) => new Date(value || "").getTime())
    .filter((value) => Number.isFinite(value));

  if (!times.length) {
    return NaN;
  }

  return Math.max(...times);
}

function productTimeScore(product) {
  const millis = getProductTimeMillis(product);

  if (!Number.isFinite(millis)) {
    return 0;
  }

  // Small freshness bonus. Status and product type still dominate.
  return Math.min(250, Math.max(0, millis / 1e10 - 150));
}

function scoreProductForLayerKey(product, key) {
  if (!productHasLayerKey(product, key)) {
    return -Infinity;
  }

  let score = productStatusScore(product);

  if (key === "groundMovementA") {
    score += product.type === "GRM" ? 520 : 0;
  } else if (
    key === "builtUpA" ||
    key === "builtUpP" ||
    key === "transportationL" ||
    key === "transportationA" ||
    key === "facilitiesA" ||
    key === "ancillaryCrisisInfoP"
  ) {
    score += product.type === "GRA" ? 520 : 0;
  } else if (key === "notAnalysedA") {
    score += product.type === "GRA" ? 260 : product.type === "GRM" ? 230 : 0;
  }

  if (product.monitoring) {
    score += 60 + (Number(product.monitoringNumber || 0) || 0) * 15;
  }

  score += productTimeScore(product);
  return score;
}

function scoreProductForCard(product) {
  let score = productHasUsefulLayers(product) ? 10000 : 0;

  score += productStatusScore(product);

  if (product.type === "GRA") score += 90;
  if (product.type === "GRM") score += 80;

  if (product.monitoring) {
    score += 50 + (Number(product.monitoringNumber || 0) || 0) * 15;
  }

  score += productTimeScore(product);
  return score;
}

function chooseBestProductForLayerKey(aoi, key) {
  const products = Array.isArray(aoi?.products) ? aoi.products : [];

  const candidates = products.filter((product) => productHasLayerKey(product, key));

  if (!candidates.length) {
    return null;
  }

  return candidates.sort(
    (a, b) => scoreProductForLayerKey(b, key) - scoreProductForLayerKey(a, key)
  )[0];
}

function collectBestLayerUrlsFromAoi(aoi) {
  const urls = {};
  const productsByLayer = {};
  const wantedKeys = [
    "builtUpA",
    "builtUpP",
    "transportationL",
    "notAnalysedA",
    "groundMovementA",
  ];

  wantedKeys.forEach((key) => {
    const product = chooseBestProductForLayerKey(aoi, key);
    const layerUrls = product ? extractLayerUrlsFromProduct(product) : {};

    if (layerUrls[key]) {
      urls[key] = layerUrls[key];
      productsByLayer[key] = product;
    }
  });

  return {
    urls,
    productsByLayer,
  };
}

function getUniqueProducts(products) {
  const output = [];
  const seen = new Set();

  (products || []).forEach((product) => {
    if (!product) return;

    const key =
      product.id ||
      `${product.type || ""}-${product.aoiNumber || ""}-${product.monitoringNumber || ""}-${product.expectedDelivery || ""}`;

    if (seen.has(key)) return;

    seen.add(key);
    output.push(product);
  });

  return output;
}

function choosePrimaryStatusProduct(products) {
  const unique = getUniqueProducts(products);

  if (!unique.length) {
    return null;
  }

  return unique.sort((a, b) => scoreProductForCard(b) - scoreProductForCard(a))[0];
}

function latestIsoFromValues(values) {
  const times = (values || [])
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!times.length) {
    return "";
  }

  return new Date(Math.max(...times)).toISOString();
}

function getLatestProductDeliveryTime(products) {
  return latestIsoFromValues(
    getUniqueProducts(products).map((product) => product?.version?.deliveryTime)
  );
}

function getLatestProductExpectedDelivery(products) {
  return latestIsoFromValues(
    getUniqueProducts(products).map((product) => product?.expectedDelivery)
  );
}

function getLatestAcquisitionTimeFromProducts(products) {
  const times = [];

  getUniqueProducts(products).forEach((product) => {
    const value = getLatestAcquisitionTime(product || {});

    if (value) {
      times.push(value);
    }
  });

  return latestIsoFromValues(times);
}

function formatProductListLabel(products) {
  const unique = getUniqueProducts(products);

  if (!unique.length) {
    return "";
  }

  return unique.map(getProductLabel).join(" + ");
}

function chooseAoiProduct(aoi) {
  const products = Array.isArray(aoi?.products) ? aoi.products : [];

  const useful = products
    .filter(productHasUsefulLayers)
    .sort((a, b) => scoreProductForCard(b) - scoreProductForCard(a));

  if (useful.length) {
    return useful[0];
  }

  return (
    products
      .slice()
      .sort((a, b) => scoreProductForCard(b) - scoreProductForCard(a))[0] ||
    null
  );
}

function renderAoiList(aois = latestAois) {
  if (!els.aoiList || !Array.isArray(aois) || !aois.length) {
    return;
  }

  els.aoiList.innerHTML = aois
    .map((aoi) => {
      const product = chooseAoiProduct(aoi);
      const available = productHasUsefulLayers(product);
      const selected = Number(aoi.number) === Number(selectedAoiNumber);

      const numberText = String(aoi.number).padStart(2, "0");
      const name = aoi.name || `AOI${numberText}`;
      const statusCode = product?.version?.statusCode || "";

      const dotClass = available ? "green" : statusCode === "N" ? "red" : "amber";

      const classes = [
        "aoi-card",
        available ? "available-aoi" : "disabled placeholder-aoi",
        selected ? "active-aoi" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const productLabel = getProductLabel(product);
      const statusText = getAoiCardStatusText(product, available);

      return `
        <button
          class="${classes}"
          type="button"
          data-aoi-number="${Number(aoi.number)}"
          aria-disabled="${available ? "false" : "true"}"
        >
          <span class="status-dot ${dotClass}" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(numberText)} ${escapeHtml(name)}</strong>
            <small>${escapeHtml(productLabel)} · ${escapeHtml(statusText)}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function getProductLabel(product) {
  if (!product) return "—";

  if (product.type === "GRM") {
    return "Ground Movement";
  }

  if (product.type === "GRA" && product.monitoring) {
    return `Grading Monitoring ${product.monitoringNumber || ""}`.trim();
  }

  if (product.type === "GRA") {
    return "Grading";
  }

  return product.type || "Product";
}

function getAoiCardStatusText(product, available) {
  if (available) {
    return t("aoiAvailable");
  }

  const status = product?.version?.statusCode || "";
  let base = t("aoiProcessing");

  if (status === "I") {
    base = t("aoiInProgress");
  } else if (status === "W") {
    base = t("aoiPlanned");
  } else if (status === "N") {
    base = t("aoiNotProduced");
  }

  const time =
    product?.expectedDelivery ||
    product?.version?.deliveryTime ||
    getLatestAcquisitionTime(product || {});

  if (time) {
    return `${base} · ${formatDateTime(time)}`;
  }

  return base;
}

function formatAoiLabel(aoi) {
  if (!aoi) return "AOI";

  return `${String(aoi.number).padStart(2, "0")} ${aoi.name || ""}`.trim();
}

function clearCopernicusDataLayers() {
  if (!map) return;

  for (const layerId of DATA_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }

  for (const sourceId of Object.values(SOURCE_IDS)) {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }

    delete loadedSourceMeta[sourceId];
  }
}

function fitAoiExtent(aoi) {
  if (!map || !aoi?.extent) {
    map.flyTo({
      center: CARACAS.center,
      zoom: CARACAS.zoom,
      pitch: CARACAS.pitch,
      bearing: CARACAS.bearing,
      duration: 1200,
      essential: true,
    });

    return;
  }

  const bounds = getBoundsFromWktPolygon(aoi.extent);

  if (!bounds) {
    return;
  }

  map.fitBounds(bounds, {
    padding: 80,
    maxZoom: 14,
    duration: 1200,
    essential: true,
  });
}

function getBoundsFromWktPolygon(wkt) {
  const matches = String(wkt).match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) || [];

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const pair of matches) {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      continue;
    }

    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

function getInitialAoiNumber() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("aoi") || params.get("aoiNumber") || params.get("aoi_number");

  if (!raw) {
    return DEFAULT_AOI_NUMBER;
  }

  const match = String(raw).match(/\d+/);

  if (!match) {
    return DEFAULT_AOI_NUMBER;
  }

  const number = Number(match[0]);

  return Number.isFinite(number) ? number : DEFAULT_AOI_NUMBER;
}

function getInitialProductKey() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("product") || params.get("productId") || "").trim();
}

function getProductKey(product) {
  if (!product) {
    return "";
  }

  if (product.id !== undefined && product.id !== null) {
    return String(product.id);
  }

  return [
    product.type || "product",
    product.monitoring ? `monitoring-${product.monitoringNumber || 0}` : "base",
    product.expectedDelivery || "",
    product.version?.deliveryTime || "",
  ].join(":");
}

function updateSelectedProductUrlParam(productKey) {
  if (!window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);

  if (productKey) {
    url.searchParams.set("product", String(productKey));
  } else {
    url.searchParams.delete("product");
    url.searchParams.delete("productId");
  }

  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function clearSelectedProductUrlParam() {
  updateSelectedProductUrlParam("");
}

function getProductsSortedForAoi(aoi) {
  const products = Array.isArray(aoi?.products) ? aoi.products.slice() : [];

  return products.sort((a, b) => scoreProductForCard(b) - scoreProductForCard(a));
}

function chooseSelectedProductForAoi(aoi, products = getProductsSortedForAoi(aoi)) {
  if (selectedProductKey) {
    const matching = products.find((product) => getProductKey(product) === selectedProductKey);

    if (matching) {
      return matching;
    }
  }

  return products[0] || null;
}

function renderProductSelector(products = currentProductOptions, selectedProduct = latestSelectedProductInfo?.product || null) {
  if (!els.productPanel || !els.productList) {
    return;
  }

  currentProductOptions = Array.isArray(products) ? products : [];

  if (currentProductOptions.length <= 1) {
    els.productPanel.classList.add("hidden");
    els.productList.innerHTML = "";
    return;
  }

  els.productPanel.classList.remove("hidden");

  const selectedKey = getProductKey(selectedProduct);

  els.productList.innerHTML = currentProductOptions
    .map((product) => {
      const productKey = getProductKey(product);
      const available = productHasUsefulLayers(product);
      const selected = productKey === selectedKey;
      const statusCode = product?.version?.statusCode || "";
      const dotClass = available ? "green" : statusCode === "N" ? "red" : "amber";
      const classes = [
        "product-card",
        selected ? "active-product" : "",
        available ? "" : "disabled-product",
      ]
        .filter(Boolean)
        .join(" ");

      const title = getProductLabel(product);
      const situation = formatProductSituationLabel(product);
      const status = getAoiCardStatusText(product, available);

      return `
        <button
          class="${classes}"
          type="button"
          data-product-key="${escapeHtml(productKey)}"
        >
          <span class="status-dot ${dotClass}" aria-hidden="true"></span>
          <span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(status)}${situation ? ` · ${escapeHtml(situation)}` : ""}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function formatProductSituationLabel(product) {
  const acquisition = getLatestAcquisitionTime(product || {});
  const time = acquisition || product?.version?.deliveryTime || product?.expectedDelivery || "";

  if (!time) {
    return "";
  }

  return formatUtcDateLabel(time);
}

function formatUtcDateLabel(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return String(value || "");
  }

  const pad = (number) => String(number).padStart(2, "0");

  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} (UTC)`;
}

function getAwsBucketFromManifest(manifest) {
  return (
    manifest?.results?.[0]?.aws_bucket ||
    "https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com"
  ).replace(/\/+$/, "");
}

function resolveCopernicusAssetUrl(pathOrUrl, manifest) {
  const value = String(pathOrUrl || "").trim();

  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${getAwsBucketFromManifest(manifest)}/${value.replace(/^\/+/, "")}`;
}

function matchImageForCogLayer(product, layer, fallbackIndex = 0) {
  const images = Array.isArray(product?.images) ? product.images : [];
  const layerName = String(layer?.name || "").toLowerCase();

  const matching = images.find((image) => {
    const fileName = String(image?.fileName || "").toLowerCase();
    if (!fileName) return false;

    const stem = fileName.replace(/\.tif+$/i, "").replace(/_ortho$/i, "");
    return layerName.includes(stem) || layerName.includes(fileName.replace(/\.tif+$/i, ""));
  });

  return matching || images[fallbackIndex] || images[0] || {};
}

function formatImageLayerLabel(image, layer) {
  const sensor = image?.sensorName || image?.sensorType || "Source image";
  const time = image?.acquisitionTime ? formatUtcDateLabel(image.acquisitionTime) : "";

  if (time) {
    return `${sensor} - ${time}`;
  }

  const name = String(layer?.name || image?.fileName || "").split("/").pop() || sensor;
  return name.replace(/_cog\.tif$/i, ".tif");
}

function extractCogLayersFromProduct(product, manifest) {
  const layers = Array.isArray(product?.layers) ? product.layers : [];

  return layers
    .filter((layer) => {
      const name = String(layer?.name || "");
      return String(layer?.format || "").toLowerCase() === "cog" || /\.tif(f)?$/i.test(name);
    })
    .map((layer, index) => {
      const image = matchImageForCogLayer(product, layer, index);
      return {
        url: resolveCopernicusAssetUrl(layer.name, manifest),
        label: formatImageLayerLabel(image, layer),
        sensorName: image?.sensorName || "",
        acquisitionTime: image?.acquisitionTime || "",
        layerName: layer.name || "",
      };
    })
    .filter((item) => Boolean(item.url));
}

function updateAoiUrlParam(aoiNumber) {
  if (!window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("aoi", String(Number(aoiNumber)));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
/* AOI dynamic helpers: end */



function isJsonDocumentMemoryCached(url) {
  return JSON_DOCUMENT_MEMORY_CACHE.has(String(url || "").trim());
}

function isPotentiallyLargeCopernicusLayer(kind, url) {
  const text = `${kind || ""} ${url || ""}`.toLowerCase();

  return (
    kind === "groundMovementA" ||
    text.includes("groundmovement") ||
    text.includes("ground_movement") ||
    text.includes("ground-movement") ||
    text.includes("grm_product")
  );
}

function maybeShowLargeLayerDownloadNotice(kind, url) {
  if (!isPotentiallyLargeCopernicusLayer(kind, url)) {
    return;
  }

  if (isJsonDocumentMemoryCached(url)) {
    return;
  }

  if (!els.status || !els.statusTitle || !els.statusMessage) {
    return;
  }

  setStatus(
    "loading",
    t("largeLayerLoadingTitle"),
    t("largeLayerLoadingText"),
    false
  );
}

async function fetchJsonDocument(url, label, options = {}) {
  const requestUrl = String(url || "").trim();

  if (!requestUrl) {
    throw new Error(`${label} URL is empty.`);
  }

  const cacheDocument = Boolean(options.cacheDocument);
  const cacheKey = requestUrl;

  if (cacheDocument && JSON_DOCUMENT_MEMORY_CACHE.has(cacheKey)) {
    console.info(`${label}: using in-memory cached JSON document.`);
    return JSON_DOCUMENT_MEMORY_CACHE.get(cacheKey);
  }

  const task = (async () => {
    const response = await fetch(requestUrl, {
      method: "GET",
      mode: "cors",

      // Important:
      // - Manifest fetches should stay fresh and are controlled by our 30-minute manifest cache.
      // - Layer JSON files are versioned URLs, so they can safely use browser cache.
      cache: options.fetchCache || (cacheDocument ? "force-cache" : "no-store"),

      headers: {
        Accept: "application/json, application/geo+json, application/tilejson, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`${label} HTTP ${response.status}: ${requestUrl}`);
    }

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error(`${label} was not valid JSON. First 300 chars:`, text.slice(0, 300));
      throw new Error(`${label} is not valid JSON: ${requestUrl}`);
    }
  })();

  if (cacheDocument) {
    JSON_DOCUMENT_MEMORY_CACHE.set(cacheKey, task);

    try {
      return await task;
    } catch (error) {
      if (JSON_DOCUMENT_MEMORY_CACHE.get(cacheKey) === task) {
        JSON_DOCUMENT_MEMORY_CACHE.delete(cacheKey);
      }

      throw error;
    }
  }

  return task;
}

function isGeoJson(json) {
  return (
    json &&
    typeof json === "object" &&
    (json.type === "FeatureCollection" ||
      json.type === "Feature" ||
      Array.isArray(json.features))
  );
}

function normalizeGeoJson(json) {
  if (json.type === "FeatureCollection") {
    return json;
  }

  if (json.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [json],
    };
  }

  if (Array.isArray(json.features)) {
    return {
      type: "FeatureCollection",
      features: json.features,
    };
  }

  throw new Error("Could not normalize GeoJSON.");
}

function isTileJson(json) {
  return (
    json &&
    typeof json === "object" &&
    (Array.isArray(json.tiles) ||
      Array.isArray(json.vector_layers) ||
      Boolean(json.tilejson))
  );
}

function detectVectorSourceLayer(tileJson, kind, url) {
  const vectorLayers = Array.isArray(tileJson.vector_layers)
    ? tileJson.vector_layers
    : [];

  if (vectorLayers.length > 0) {
    const matching = vectorLayers.find((layer) => {
      return classifyLayer(String(layer.id || "")) === kind;
    });

    if (matching?.id) return matching.id;

    if (vectorLayers[0]?.id) return vectorLayers[0].id;
  }

  if (tileJson.name) {
    return tileJson.name;
  }

  const filename = url.split("/").pop() || "";
  return filename.replace(/\.json(\?.*)?$/i, "");
}

function resolveTileUrl(tile, tileJsonUrl) {
  if (/^https?:\/\//i.test(tile)) {
    return tile;
  }

  const base = new URL(tileJsonUrl);

  if (tile.startsWith("/")) {
    return `${base.origin}${tile}`;
  }

  if (/^EMSR\d+/i.test(tile)) {
    return `${base.origin}/${tile}`;
  }

  return new URL(tile, tileJsonUrl).href;
}

function summarizeJson(json, url) {
  return {
    url,
    keys: Object.keys(json || {}),
    type: json?.type,
    tilejson: json?.tilejson,
    hasTiles: Array.isArray(json?.tiles),
    tilesCount: Array.isArray(json?.tiles) ? json.tiles.length : 0,
    hasVectorLayers: Array.isArray(json?.vector_layers),
    vectorLayers: Array.isArray(json?.vector_layers)
      ? json.vector_layers.map((layer) => layer.id || layer.name || layer)
      : null,
    featureCount: Array.isArray(json?.features) ? json.features.length : null,
  };
}

const DAMAGE_PROPERTY_FIELDS = [
  "damage_gra",
  "damage_grade",
  "Damage_Grade",
  "DAMAGE_GRA",
  "damage",
  "Damage",
];

function readFirstTextProperty(properties, fields) {
  const props = properties || {};

  for (const field of fields || []) {
    const value = props[field];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

function normalizeSummaryText(value) {
  return String(value || "").toLowerCase().trim();
}

function canonicalDamageClassFromText(value) {
  const lower = normalizeSummaryText(value);

  if (
    !lower ||
    lower.includes("no visible") ||
    lower.includes("no damage") ||
    lower.includes("not damaged") ||
    lower.includes("not analys") ||
    lower.includes("not analyz")
  ) {
    return "";
  }

  if (
    lower.includes("destroy") ||
    lower.includes("destruid") ||
    lower.includes("destru")
  ) {
    return "destroyed";
  }

  if (
    lower.includes("possible") ||
    lower.includes("possibly") ||
    lower.includes("posible")
  ) {
    return "possible";
  }

  if (
    lower.includes("damag") ||
    lower.includes("dañ") ||
    lower.includes("danno")
  ) {
    return "damaged";
  }

  return "";
}

function canonicalDamageClassFromProperties(properties) {
  return canonicalDamageClassFromText(
    readFirstTextProperty(properties, DAMAGE_PROPERTY_FIELDS)
  );
}

function lowerProperty(properties, field) {
  return normalizeSummaryText((properties || {})[field]);
}

function allPropertiesText(properties) {
  return Object.entries(properties || {})
    .map(([key, value]) => `${key}:${value ?? ""}`)
    .join(" ")
    .toLowerCase();
}

function includesAnyText(text, tokens) {
  return (tokens || []).some((token) => text.includes(token));
}

function transportationNoVisibleDamageFromProperties(properties) {
  const damage = normalizeSummaryText(
    readFirstTextProperty(properties, DAMAGE_PROPERTY_FIELDS)
  );

  if (!damage) {
    return true;
  }

  if (damage.includes("not analys") || damage.includes("not analyz")) {
    return false;
  }

  return (
    damage.includes("no visible damage") ||
    damage.includes("no damage") ||
    damage.includes("not damaged")
  );
}

function classifyTransportationPropertiesForLegend(properties) {
  if (!transportationNoVisibleDamageFromProperties(properties)) {
    return "";
  }

  const simplified = lowerProperty(properties, "simplified");
  const info = lowerProperty(properties, "info");
  const objType = lowerProperty(properties, "obj_type");
  const fallback = allPropertiesText(properties);

  const highway =
    simplified === "highway" ||
    info.includes("2111-highways") ||
    info.includes("2111-highway") ||
    info.includes("highways") ||
    includesAnyText(fallback, [
      "motorway",
      "freeway",
      "expressway",
      "autopista",
      "trunk",
      "highway, no visible",
      "highway no visible",
      "highway - no visible",
    ]);

  const main =
    simplified === "main roads" ||
    simplified === "main road" ||
    info.includes("21120-primary road") ||
    info.includes("21121-secondary road") ||
    info.includes("primary road") ||
    info.includes("secondary road") ||
    includesAnyText(fallback, [
      "main road",
      "mainroad",
      "primary",
      "secondary",
      "major road",
      "arterial",
      "principal",
    ]);

  const local =
    simplified === "local roads" ||
    simplified === "local road" ||
    info.includes("21122-local road") ||
    info.includes("local road") ||
    includesAnyText(fallback, [
      "local road",
      "localroad",
      "residential",
      "tertiary",
      "unclassified",
      "service road",
      "minor road",
      "street",
      "calle",
    ]);

  const airfieldRunway =
    simplified === "airfield runways" ||
    simplified === "airfield runway" ||
    simplified === "runways" ||
    simplified === "runway" ||
    info.includes("2131-airfield runway") ||
    info.includes("2131-airfield runways") ||
    info.includes("airfield runway") ||
    info.includes("runway") ||
    objType.includes("213-air transport") ||
    includesAnyText(fallback, [
      "airfield runway",
      "airfield runways",
      "airport runway",
      "aerodrome runway",
      "runway",
      "airstrip",
      "pista de aterrizaje",
    ]);

  const track =
    simplified === "tracks" ||
    simplified === "track" ||
    info.includes("21124-cart track") ||
    info.includes("cart track") ||
    includesAnyText(fallback, [
      "track",
      "dirt road",
      "unpaved",
      "path",
      "trail",
      "camino",
      "pista",
    ]);

  const railway =
    simplified === "railways" ||
    simplified === "railway" ||
    simplified === "subways" ||
    simplified === "subway" ||
    info.includes("2121-long-distance railways") ||
    info.includes("21221-subway") ||
    info.includes("railways") ||
    info.includes("railway") ||
    info.includes("subway") ||
    objType.includes("212-railways") ||
    includesAnyText(fallback, [
      "railway",
      "railroad",
      "rail road",
      "rail line",
      "rail_line",
      "ferrocarril",
      "subway",
      "metro",
      "train",
    ]);

  if (highway) return "highway";
  if (main) return "main";
  if (airfieldRunway) return "airfieldRunway";
  if (track) return "track";
  if (railway) return "railway";
  if (local) return "local";

  return "local";
}

function classifyAncillaryCrisisPropertiesForLegend(properties) {
  const text = allPropertiesText(properties);

  if (
    text.includes("blocked road") ||
    text.includes("blocked-road") ||
    text.includes("road block") ||
    text.includes("interruption") ||
    text.includes("blocked")
  ) {
    return "blockedRoadInterruption";
  }

  return "blockedRoadInterruption";
}

function classifyTransportationAreaPropertiesForLegend(properties) {
  const text = allPropertiesText(properties);

  if (
    text.includes("airfield") ||
    text.includes("heliport") ||
    text.includes("helipad") ||
    text.includes("runway") ||
    text.includes("airport")
  ) {
    return "airfieldAndHeliportDamaged";
  }

  return "airfieldAndHeliportDamaged";
}

function summarizeLayerFeatures(kind, features) {
  const list = Array.isArray(features) ? features : [];
  const summary = {};

  if (kind === "builtUpA" || kind === "builtUpP" || kind === "facilitiesA") {
    const damageClasses = new Set();

    list.forEach((feature) => {
      const damageClass = canonicalDamageClassFromProperties(feature?.properties || {});

      if (damageClass) {
        damageClasses.add(damageClass);
      }
    });

    summary.damageClasses = Array.from(damageClasses);
  }

  if (kind === "transportationL") {
    const transportClasses = new Set();

    list.forEach((feature) => {
      const transportClass = classifyTransportationPropertiesForLegend(
        feature?.properties || {}
      );

      if (transportClass) {
        transportClasses.add(transportClass);
      }
    });

    summary.transportClasses = Array.from(transportClasses);
  }

  if (kind === "transportationA") {
    const transportAreaClasses = new Set();

    list.forEach((feature) => {
      const className = classifyTransportationAreaPropertiesForLegend(
        feature?.properties || {}
      );

      if (className) {
        transportAreaClasses.add(className);
      }
    });

    summary.transportAreaClasses = Array.from(transportAreaClasses);
  }

  if (kind === "ancillaryCrisisInfoP") {
    const crisisClasses = new Set();

    list.forEach((feature) => {
      const className = classifyAncillaryCrisisPropertiesForLegend(
        feature?.properties || {}
      );

      if (className) {
        crisisClasses.add(className);
      }
    });

    summary.crisisClasses = Array.from(crisisClasses);
  }

  return summary;
}

function damageTextExpression() {
  return [
    "downcase",
    [
      "to-string",
      [
        "coalesce",
        ["get", "damage_gra"],
        ["get", "damage_grade"],
        ["get", "Damage_Grade"],
        ["get", "DAMAGE_GRA"],
        ["get", "damage"],
        ["get", "Damage"],
        "",
      ],
    ],
  ];
}

function damageFilterExpression() {
  const damage = damageTextExpression();

  return [
    "all",
    ["!=", damage, ""],
    ["!=", damage, "no visible damage"],
    ["!=", damage, "no damage"],
    ["!=", damage, "not damaged"],
  ];
}

function damageColorExpression() {
  const damage = damageTextExpression();

  return [
    "case",
    ["==", damage, "destroyed"],
    "#ff3b30",

    ["==", damage, "damaged"],
    "#ff8c00",

    ["==", damage, "possibly damaged"],
    "#ffd400",

    ["==", damage, "possible damage"],
    "#ffd400",

    "#ffd400",
  ];
}

function withOptionalSourceLayer(layerDefinition, meta) {
  if (meta.sourceType === "vector" && meta.sourceLayer) {
    layerDefinition["source-layer"] = meta.sourceLayer;
  }

  return layerDefinition;
}
/* Transportation and AOI style helpers: start */
function propertyTextExpression(field) {
  return [
    "downcase",
    [
      "to-string",
      [
        "coalesce",
        ["get", field],
        "",
      ],
    ],
  ];
}

function containsTextExpression(textExpression, token) {
  return [">=", ["index-of", token, textExpression], 0];
}

function anyContainsTextExpression(textExpression, tokens) {
  return [
    "any",
    ...tokens.map((token) => containsTextExpression(textExpression, token)),
  ];
}

function notExpression(expression) {
  return ["!", expression];
}

function transportationFallbackTextExpression() {
  const fields = [
    "transportation",
    "Transportation",
    "transportation_type",
    "transportation_ty",
    "road_type",
    "roadType",
    "RoadType",
    "road_class",
    "roadclass",
    "class",
    "Class",
    "fclass",
    "FCLASS",
    "type",
    "Type",
    "category",
    "Category",
    "legend",
    "Legend",
    "description",
    "Description",
    "symbol_text",
    "highway",
    "railway",
  ];

  const parts = [];

  fields.forEach((field) => {
    parts.push(["to-string", ["coalesce", ["get", field], ""]]);
    parts.push(" ");
  });

  return ["downcase", ["concat", ...parts]];
}

function transportationDamageTextExpression() {
  return [
    "downcase",
    [
      "to-string",
      [
        "coalesce",
        ["get", "damage_gra"],
        ["get", "damage_grade"],
        ["get", "Damage_Grade"],
        ["get", "DAMAGE_GRA"],
        ["get", "damage"],
        ["get", "Damage"],
        "",
      ],
    ],
  ];
}

function transportationNoVisibleDamageExpression() {
  const damage = transportationDamageTextExpression();

  return [
    "any",

    // Official EMSR884 GRA value.
    containsTextExpression(damage, "no visible damage"),

    // Defensive synonyms.
    containsTextExpression(damage, "no damage"),
    containsTextExpression(damage, "not damaged"),

    // Fallback only if a future vector tile drops the damage field.
    // Current AOI02 GRA has damage_gra and Not Analysed will NOT pass this.
    ["==", damage, ""],
  ];
}

function transportationClassFilter(kind) {
  const simplified = propertyTextExpression("simplified");
  const info = propertyTextExpression("info");
  const objType = propertyTextExpression("obj_type");
  const fallback = transportationFallbackTextExpression();

  const highway = [
    "any",
    ["==", simplified, "highway"],
    containsTextExpression(info, "2111-highways"),
    containsTextExpression(info, "2111-highway"),
    containsTextExpression(info, "highways"),
    anyContainsTextExpression(fallback, [
      "motorway",
      "freeway",
      "expressway",
      "autopista",
      "trunk",
      "highway, no visible",
      "highway no visible",
      "highway - no visible",
    ]),
  ];

  const main = [
    "any",
    ["==", simplified, "main roads"],
    ["==", simplified, "main road"],
    containsTextExpression(info, "21120-primary road"),
    containsTextExpression(info, "21121-secondary road"),
    containsTextExpression(info, "primary road"),
    containsTextExpression(info, "secondary road"),
    anyContainsTextExpression(fallback, [
      "main road",
      "mainroad",
      "primary",
      "secondary",
      "major road",
      "arterial",
      "principal",
    ]),
  ];

  const local = [
    "any",
    ["==", simplified, "local roads"],
    ["==", simplified, "local road"],
    containsTextExpression(info, "21122-local road"),
    containsTextExpression(info, "local road"),
    anyContainsTextExpression(fallback, [
      "local road",
      "localroad",
      "residential",
      "tertiary",
      "unclassified",
      "service road",
      "minor road",
      "street",
      "calle",
    ]),
  ];

  const airfieldRunway = [
    "any",
    ["==", simplified, "airfield runways"],
    ["==", simplified, "airfield runway"],
    ["==", simplified, "runways"],
    ["==", simplified, "runway"],
    containsTextExpression(info, "2131-airfield runway"),
    containsTextExpression(info, "2131-airfield runways"),
    containsTextExpression(info, "airfield runway"),
    containsTextExpression(info, "runway"),
    containsTextExpression(objType, "213-air transport"),
    anyContainsTextExpression(fallback, [
      "airfield runway",
      "airfield runways",
      "airport runway",
      "aerodrome runway",
      "runway",
      "airstrip",
      "pista de aterrizaje",
    ]),
  ];

  const track = [
    "any",
    ["==", simplified, "tracks"],
    ["==", simplified, "track"],
    containsTextExpression(info, "21124-cart track"),
    containsTextExpression(info, "cart track"),
    anyContainsTextExpression(fallback, [
      "track",
      "dirt road",
      "unpaved",
      "path",
      "trail",
      "camino",
      "pista",
    ]),
  ];

  const railway = [
    "any",
    ["==", simplified, "railways"],
    ["==", simplified, "railway"],
    ["==", simplified, "subways"],
    ["==", simplified, "subway"],
    containsTextExpression(info, "2121-long-distance railways"),
    containsTextExpression(info, "21221-subway"),
    containsTextExpression(info, "railways"),
    containsTextExpression(info, "railway"),
    containsTextExpression(info, "subway"),
    containsTextExpression(objType, "212-railways"),
    anyContainsTextExpression(fallback, [
      "railway",
      "railroad",
      "rail road",
      "rail line",
      "rail_line",
      "ferrocarril",
      "subway",
      "metro",
      "train",
    ]),
  ];

  const known = ["any", highway, main, local, track, airfieldRunway, railway];
  const noVisibleDamage = transportationNoVisibleDamageExpression();

  if (kind === "highway") {
    return ["all", noVisibleDamage, highway];
  }

  if (kind === "main") {
    return [
      "all",
      noVisibleDamage,
      notExpression(highway),
      notExpression(railway),
      notExpression(track),
      notExpression(airfieldRunway),
      main,
    ];
  }

  if (kind === "track") {
    return [
      "all",
      noVisibleDamage,
      notExpression(highway),
      notExpression(railway),
      notExpression(airfieldRunway),
      track,
    ];
  }

  if (kind === "airfieldRunway") {
    return ["all", noVisibleDamage, airfieldRunway];
  }

  if (kind === "railway") {
    return ["all", noVisibleDamage, railway];
  }

  if (kind === "local") {
    return [
      "all",
      noVisibleDamage,
      notExpression(highway),
      notExpression(main),
      notExpression(track),
      notExpression(airfieldRunway),
      notExpression(railway),
      [
        "any",
        local,
        notExpression(known),
      ],
    ];
  }

  return hiddenDamageExpression();
}

function lineWidthExpression(z9, z12, z16) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    9,
    z9,
    12,
    z12,
    16,
    z16,
  ];
}

function showAoiExtent(aoi) {
  if (!mapReady || !map || !aoi?.extent) {
    return;
  }

  const geojson = wktPolygonToGeoJson(aoi.extent, {
    name: aoi.name || "",
    number: aoi.number,
    activationCode: aoi.activationCode || "EMSR884",
  });

  if (!geojson) {
    return;
  }

  const sourceId = SOURCE_IDS.aoi;
  const existingSource = map.getSource(sourceId);

  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(geojson);
  } else if (!existingSource) {
    map.addSource(sourceId, {
      type: "geojson",
      data: geojson,
    });
  }

  addOrReplaceDataLayer({
    id: "aoi-fill",
    type: "fill",
    source: sourceId,
    paint: {
      "fill-color": "rgba(97, 240, 109, 0.12)",
      "fill-opacity": 0.08,
    },
  });

  addOrReplaceDataLayer({
    id: "aoi-outline",
    type: "line",
    source: sourceId,
    paint: {
      "line-color": "#61f06d",
      "line-opacity": 0.98,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        8,
        1.5,
        12,
        2.6,
        16,
        4,
      ],
    },
  });

  applyLayerVisibility();
}

function wktPolygonToGeoJson(wkt, properties = {}) {
  const matches =
    String(wkt).match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) || [];

  const coordinates = matches
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

  if (coordinates.length < 3) {
    return null;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (first[0] !== last[0] || first[1] !== last[1]) {
    coordinates.push([...first]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties,
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
      },
    ],
  };
}
/* Transportation and AOI style helpers: end */



function groundMovementValueExpression() {
  return [
    "downcase",
    [
      "to-string",
      [
        "coalesce",
        ["get", "value"],
        ["get", "Value"],
        ["get", "VALUE"],
        ["get", "class"],
        ["get", "Class"],
        ["get", "category"],
        ["get", "Category"],
        "",
      ],
    ],
  ];
}

function groundMovementClassFilter(item) {
  return ["==", groundMovementValueExpression(), String(item.value).toLowerCase()];
}

function addGroundMovementStyleLayers(meta) {
  GROUND_MOVEMENT_CLASSES.forEach((item) => {
    addOrReplaceDataLayer(
      withOptionalSourceLayer(
        {
          id: `ground-movement-${item.id}-fill`,
          type: "fill",
          source: SOURCE_IDS.groundMovementA,
          filter: groundMovementClassFilter(item),
          paint: {
            "fill-color": item.color,
            "fill-opacity": 0.72,
          },
        },
        meta
      )
    );

    addOrReplaceDataLayer(
      withOptionalSourceLayer(
        {
          id: `ground-movement-${item.id}-outline`,
          type: "line",
          source: SOURCE_IDS.groundMovementA,
          filter: groundMovementClassFilter(item),
          paint: {
            "line-color": item.color,
            "line-opacity": 0.42,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.15,
              12,
              0.35,
              16,
              0.8,
            ],
          },
        },
        meta
      )
    );
  });
}

function hasAnyMapLayer(layerIds) {
  return Boolean(mapReady && map && layerIds.some((layerId) => map.getLayer(layerId)));
}

function setLegendElementsVisible(selector, visible) {
  document.querySelectorAll(selector).forEach((node) => {
    node.classList.toggle("hidden", !visible);
  });
}

function getLoadedSourceMeta(kind) {
  return loadedSourceMeta[SOURCE_IDS[kind]] || null;
}

function shouldShowBuiltUpDamageRow(kind, damageKind, hasLayer) {
  if (!hasLayer) {
    return false;
  }

  const classes = getLoadedSourceMeta(kind)?.damageClasses;

  // Vector-tile TileJSON sources usually do not expose value counts. Keep
  // classes visible when the source schema is unknown.
  if (!Array.isArray(classes)) {
    return true;
  }

  return classes.includes(damageKind);
}

function shouldShowTransportClassRow(classKey, hasTransportation) {
  if (!hasTransportation) {
    return false;
  }

  const classes = getLoadedSourceMeta("transportationL")?.transportClasses;

  // For vector-tile sources without class summaries, keep rows visible.
  if (!Array.isArray(classes)) {
    return true;
  }

  return classes.includes(classKey);
}

function getLoadedSourceMeta(kind) {
  return loadedSourceMeta[SOURCE_IDS[kind]] || null;
}

function orderedDamageClasses(classes) {
  const order = ["destroyed", "damaged", "possible"];

  if (!Array.isArray(classes)) {
    return order;
  }

  return order.filter((item) => classes.includes(item));
}

function getDamageClassesForLegend(kind) {
  const meta = getLoadedSourceMeta(kind);

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.damageClasses)) {
    return orderedDamageClasses(meta.damageClasses);
  }

  return ["destroyed", "damaged", "possible"];
}

function getTransportClassesForLegend() {
  const meta = getLoadedSourceMeta("transportationL");
  const order = ["highway", "main", "local", "track", "airfieldRunway", "railway"];

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.transportClasses)) {
    return order.filter((item) => meta.transportClasses.includes(item));
  }

  return order;
}

function getTransportAreaClassesForLegend() {
  const meta = getLoadedSourceMeta("transportationA");

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.transportAreaClasses)) {
    return ["airfieldAndHeliportDamaged"].filter((item) =>
      meta.transportAreaClasses.includes(item)
    );
  }

  return ["airfieldAndHeliportDamaged"];
}

function getCrisisClassesForLegend() {
  const meta = getLoadedSourceMeta("ancillaryCrisisInfoP");

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.crisisClasses)) {
    return ["blockedRoadInterruption"].filter((item) =>
      meta.crisisClasses.includes(item)
    );
  }

  return ["blockedRoadInterruption"];
}

function damageClassLabel(className) {
  if (className === "destroyed") return t("destroyed");
  if (className === "damaged") return t("confirmedDamaged");
  if (className === "possible") return t("possiblyDamaged");
  return className;
}

function damageSwatchClass(className, geometry = "area") {
  if (geometry === "point") {
    return `point-swatch ${className}`;
  }

  return `swatch ${className}`;
}

function renderToggleRow({ key, swatchHtml, label, checked = true, extraClass = "" }) {
  const isChecked = getLayerVisibility(key, checked);

  return `
    <label class="map-legend-row legend-toggle ${escapeHtml(extraClass)}">
      <input class="layer-checkbox" type="checkbox" data-layer-toggle="${escapeHtml(key)}" ${isChecked ? "checked" : ""} />
      ${swatchHtml}
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderLegendSection(title, rowsHtml) {
  const rows = Array.isArray(rowsHtml) ? rowsHtml.filter(Boolean).join("") : String(rowsHtml || "");

  if (!rows.trim()) {
    return "";
  }

  return `
    <div class="legend-section">
      <div class="legend-section-title">${escapeHtml(title)}</div>
      ${rows}
    </div>
  `;
}

function renderDamageLegendSection(kind, title, geometry = "area") {
  const classes = getDamageClassesForLegend(kind);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) => {
    const key = `${kind}:${className}`;
    const swatchClass = damageSwatchClass(className, geometry);

    return renderToggleRow({
      key,
      swatchHtml: `<span class="${escapeHtml(swatchClass)}"></span>`,
      label: damageClassLabel(className),
      checked: true,
    });
  });

  return renderLegendSection(title, rows);
}

function renderTransportLegendSection() {
  const classes = getTransportClassesForLegend();

  if (!classes.length) {
    return "";
  }

  const labels = {
    highway: t("highwayNoVisibleDamage"),
    main: t("mainRoadNoVisibleDamage"),
    local: t("localRoadNoVisibleDamage"),
    track: t("trackNoVisibleDamage"),
    airfieldRunway: t("airfieldRunwayNoVisibleDamage"),
    railway: t("railwayNoVisibleDamage"),
  };

  const swatches = {
    highway: "highway",
    main: "main-road",
    local: "local-road",
    track: "track",
    airfieldRunway: "runway",
    railway: "railway",
  };

  const rows = classes.map((className) =>
    renderToggleRow({
      key: `transportationL:${className}`,
      swatchHtml: `<span class="line-swatch ${escapeHtml(swatches[className] || "local-road")}"></span>`,
      label: labels[className] || className,
      checked: true,
      extraClass: "transport-toggle",
    })
  );

  return renderLegendSection(t("transportationGrading"), rows);
}

function renderTransportationAreaLegendSection() {
  const classes = getTransportAreaClassesForLegend();

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) =>
    renderToggleRow({
      key: `transportationA:${className}`,
      swatchHtml: '<span class="area-swatch transport-area-damaged"></span>',
      label: t("airfieldAndHeliportDamaged"),
      checked: true,
    })
  );

  return renderLegendSection(t("transportationArea"), rows);
}

function renderCrisisLegendSection() {
  const classes = getCrisisClassesForLegend();

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) =>
    renderToggleRow({
      key: `ancillaryCrisisInfoP:${className}`,
      swatchHtml: '<span class="crisis-swatch"></span>',
      label: t("blockedRoadInterruption"),
      checked: true,
    })
  );

  return renderLegendSection(t("crisisPoints"), rows);
}

function renderFacilitiesLegendSection() {
  const classes = getDamageClassesForLegend("facilitiesA");

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) => {
    const swatch =
      className === "possible"
        ? '<span class="area-swatch facility-possible"></span>'
        : '<span class="area-swatch facility-damaged"></span>';

    return renderToggleRow({
      key: `facilitiesA:${className}`,
      swatchHtml: swatch,
      label: damageClassLabel(className),
      checked: true,
    });
  });

  return renderLegendSection(t("facilitiesArea"), rows);
}

function renderNotAnalysedLegendSection() {
  if (!hasAnyMapLayer([
    "not-analysed-fill",
    "not-analysed-hatch-fill",
    "not-analysed-outline",
  ])) {
    return "";
  }

  return renderLegendSection(
    t("notAnalysed"),
    renderToggleRow({
      key: "notAnalysedA:default",
      swatchHtml: '<span class="swatch hatch"></span>',
      label: t("notAnalysed"),
      checked: false,
    })
  );
}

function renderGroundMovementLegendSection() {
  if (!hasAnyMapLayer(GROUND_MOVEMENT_LAYER_IDS)) {
    return "";
  }

  const rows = [
    `<div class="legend-subtitle">${escapeHtml(t("groundMovementM"))}</div>`,
    ...GROUND_MOVEMENT_CLASSES.map((item) =>
      renderToggleRow({
        key: `groundMovementA:${item.key}`,
        swatchHtml: `<span class="ground-swatch gm-${escapeHtml(item.id)}"></span>`,
        label: t(item.key.replace(/^ground/, "gm")) === item.key.replace(/^ground/, "gm")
          ? item.value
          : t(item.key.replace(/^ground/, "gm")),
        checked: true,
      })
    ),
  ];

  return renderLegendSection(t("groundMovementGrading"), rows);
}

function renderSourceImageryLegendSection(info) {
  const cogs = Array.isArray(info?.cogLayers) ? info.cogLayers : [];

  if (!cogs.length) {
    return "";
  }

  const rows = cogs
    .map((item) => {
      return `
        <div class="map-legend-row">
          <span class="image-swatch"></span>
          <a class="image-legend-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>
        </div>
      `;
    })
    .join("");

  return renderLegendSection(t("sourceImagery"), rows);
}

function renderAoiLegendSection() {
  if (!hasAnyMapLayer(AOI_LAYER_IDS)) {
    return "";
  }

  return renderLegendSection(
    t("generalInformation"),
    renderToggleRow({
      key: "aoi:default",
      swatchHtml: '<span class="aoi-swatch"></span>',
      label: t("areaOfInterest"),
      checked: true,
    })
  );
}

function renderDynamicLegend(info = latestSelectedProductInfo) {
  const body = document.querySelector("#map-legend .map-legend-body");

  if (!body) {
    return;
  }

  const sections = [
    renderCrisisLegendSection(),
    renderDamageLegendSection("builtUpP", t("builtUpPoints"), "point"),
    renderDamageLegendSection("builtUpA", t("builtUpArea"), "area"),
    renderTransportLegendSection(),
    renderNotAnalysedLegendSection(),
    renderFacilitiesLegendSection(),
    renderTransportationAreaLegendSection(),
    renderGroundMovementLegendSection(),
    renderSourceImageryLegendSection(info || {}),
    renderAoiLegendSection(),
  ].filter(Boolean);

  if (!sections.length) {
    body.innerHTML = `<div class="map-legend-placeholder">${escapeHtml(t("noDisplayableLayers"))}</div>`;
  } else {
    body.innerHTML = sections.join("");
  }

  syncLayerToggleInputs();
}

function updateLegendAvailability() {
  syncLayerToggleInputs();
}

function addBuiltUpStyleLayers(meta) {
  const color = damageColorExpression();

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "built-up-fill",
        type: "fill",
        source: SOURCE_IDS.builtUpA,
        filter: buildDamageLayerFilterForKind("builtUpA"),
        paint: {
          "fill-color": color,
          "fill-opacity": 0.78,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "built-up-outline",
        type: "line",
        source: SOURCE_IDS.builtUpA,
        filter: buildDamageLayerFilterForKind("builtUpA"),
        paint: {
          "line-color": color,
          "line-opacity": 0.95,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.8,
            13,
            1.5,
            16,
            2.4,
          ],
        },
      },
      meta
    )
  );
}

function addBuiltUpPointStyleLayers(meta) {
  const color = damageColorExpression();
  const filter = buildDamageLayerFilterForKind("builtUpP");

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "built-up-point-halo",
        type: "circle",
        source: SOURCE_IDS.builtUpP,
        filter,
        paint: {
          "circle-color": "rgba(255, 255, 255, 0.92)",
          "circle-opacity": 0.78,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            4.5,
            13,
            6.8,
            16,
            10.5,
          ],
          "circle-stroke-color": "rgba(0, 0, 0, 0.58)",
          "circle-stroke-width": 1,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "built-up-point-circle",
        type: "circle",
        source: SOURCE_IDS.builtUpP,
        filter,
        paint: {
          "circle-color": color,
          "circle-opacity": 0.98,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3.2,
            13,
            5,
            16,
            8.2,
          ],
          "circle-stroke-color": "rgba(255, 255, 255, 0.95)",
          "circle-stroke-width": 1.1,
        },
      },
      meta
    )
  );
}

function addFacilitiesAreaStyleLayers(meta) {
  const color = damageColorExpression();

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "facilities-area-fill",
        type: "fill",
        source: SOURCE_IDS.facilitiesA,
        filter: buildDamageLayerFilterForKind("facilitiesA"),
        paint: {
          "fill-color": color,
          "fill-opacity": 0.55,
          "fill-outline-color": "rgba(255, 0, 255, 0.9)",
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "facilities-area-outline",
        type: "line",
        source: SOURCE_IDS.facilitiesA,
        filter: buildDamageLayerFilterForKind("facilitiesA"),
        paint: {
          "line-color": "rgba(255, 0, 255, 0.95)",
          "line-opacity": 0.95,
          "line-width": lineWidthExpression(0.8, 1.5, 2.5),
        },
      },
      meta
    )
  );
}

function addTransportationAreaStyleLayers(meta) {
  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "transportation-area-fill",
        type: "fill",
        source: SOURCE_IDS.transportationA,
        filter: transportationAreaFilterExpression(),
        paint: {
          "fill-color": "rgba(245, 148, 0, 0.38)",
          "fill-opacity": 0.55,
          "fill-outline-color": "rgba(245, 148, 0, 0.95)",
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "transportation-area-outline",
        type: "line",
        source: SOURCE_IDS.transportationA,
        filter: transportationAreaFilterExpression(),
        paint: {
          "line-color": "rgba(245, 148, 0, 0.98)",
          "line-opacity": 0.95,
          "line-width": lineWidthExpression(0.8, 1.6, 2.8),
        },
      },
      meta
    )
  );
}

function addAncillaryCrisisInfoStyleLayers(meta) {
  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "crisis-point-halo",
        type: "circle",
        source: SOURCE_IDS.ancillaryCrisisInfoP,
        filter: ancillaryCrisisInfoFilterExpression(),
        paint: {
          "circle-color": "rgba(255, 111, 0, 0.25)",
          "circle-opacity": 0.95,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            7,
            13,
            10,
            16,
            15,
          ],
          "circle-stroke-color": "rgba(255, 111, 0, 0.95)",
          "circle-stroke-width": 2.2,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "crisis-point-circle",
        type: "circle",
        source: SOURCE_IDS.ancillaryCrisisInfoP,
        filter: ancillaryCrisisInfoFilterExpression(),
        paint: {
          "circle-color": "rgba(8, 10, 14, 0.96)",
          "circle-opacity": 0.98,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3.5,
            13,
            5,
            16,
            8,
          ],
          "circle-stroke-color": "rgba(255, 111, 0, 1)",
          "circle-stroke-width": 2.4,
        },
      },
      meta
    )
  );
}

function addTransportationStyleLayer(meta) {
  const layers = [
    {
      id: "transportation-local-road-line",
      filter: transportationClassFilter("local"),
      paint: {
        "line-color": "rgba(170, 174, 180, 0.92)",
        "line-opacity": 0.82,
        "line-width": lineWidthExpression(0.45, 1.0, 1.8),
      },
    },

    {
      id: "transportation-track-line",
      filter: transportationClassFilter("track"),
      paint: {
        "line-color": "rgba(190, 194, 200, 0.96)",
        "line-opacity": 0.86,
        "line-width": lineWidthExpression(0.45, 1.0, 1.8),
        "line-dasharray": [2, 2],
      },
    },

    {
      id: "transportation-airfield-runway-line",
      filter: transportationClassFilter("airfieldRunway"),
      paint: {
        "line-color": "rgba(222, 226, 230, 0.78)",
        "line-opacity": 0.82,
        "line-width": lineWidthExpression(0.7, 1.7, 3.0),
      },
    },

    {
      id: "transportation-main-road-line",
      filter: transportationClassFilter("main"),
      paint: {
        "line-color": "rgba(246, 248, 250, 0.96)",
        "line-opacity": 0.9,
        "line-width": lineWidthExpression(0.65, 1.6, 2.8),
      },
    },

    {
      id: "transportation-highway-line",
      filter: transportationClassFilter("highway"),
      paint: {
        "line-color": "rgba(255, 180, 188, 0.98)",
        "line-opacity": 0.96,
        "line-width": lineWidthExpression(1.0, 2.6, 4.6),
      },
    },

    {
      id: "transportation-railway-line",
      filter: transportationClassFilter("railway"),
      paint: {
        "line-color": "rgba(8, 12, 18, 0.98)",
        "line-opacity": 0.96,
        "line-width": lineWidthExpression(0.7, 1.5, 2.4),
      },
    },

    {
      id: "transportation-railway-ticks",
      filter: transportationClassFilter("railway"),
      paint: {
        "line-color": "rgba(8, 12, 18, 0.98)",
        "line-opacity": 0.72,
        "line-width": lineWidthExpression(2.0, 3.4, 5.2),
        "line-dasharray": [0.1, 1.6],
      },
    },
  ];

  layers.forEach((layer) => {
    addOrReplaceDataLayer(
      withOptionalSourceLayer(
        {
          id: layer.id,
          type: "line",
          source: SOURCE_IDS.transportationL,
          filter: layer.filter,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: layer.paint,
        },
        meta
      )
    );
  });
}

function addNotAnalysedStyleLayers(meta) {
  if (!map.hasImage("not-analysed-hatch")) {
    addHatchPattern();
  }

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "not-analysed-fill",
        type: "fill",
        source: SOURCE_IDS.notAnalysedA,
        paint: {
          "fill-color": "rgba(31, 36, 46, 0.88)",
          "fill-opacity": 0.38,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "not-analysed-hatch-fill",
        type: "fill",
        source: SOURCE_IDS.notAnalysedA,
        paint: {
          "fill-pattern": "not-analysed-hatch",
          "fill-opacity": 0.42,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "not-analysed-outline",
        type: "line",
        source: SOURCE_IDS.notAnalysedA,
        paint: {
          "line-color": "rgba(220, 228, 240, 0.55)",
          "line-width": 1,
          "line-dasharray": [2, 2],
        },
      },
      meta
    )
  );
}

function addHatchPattern() {
  if (!map || map.hasImage("not-analysed-hatch")) return;

  const size = 12;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = "rgba(40, 45, 55, 0.72)";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(210, 218, 230, 0.88)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-size, size);
  ctx.lineTo(size, -size);
  ctx.moveTo(0, size * 1.5);
  ctx.lineTo(size * 1.5, 0);
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  map.addImage("not-analysed-hatch", imageData, { pixelRatio: 1 });
}

function addOrReplaceDataLayer(layerDefinition) {
  if (map.getLayer(layerDefinition.id)) {
    map.removeLayer(layerDefinition.id);
  }

  const beforeId = map.getLayer(BASE_LAYER_IDS.labels)
    ? BASE_LAYER_IDS.labels
    : undefined;

  try {
    map.addLayer(layerDefinition, beforeId);
  } catch (error) {
    console.error("Failed to add layer:", layerDefinition);
    throw error;
  }
}

function moveLabelsToTop() {
  if (!mapReady || !map.getLayer(BASE_LAYER_IDS.labels)) return;

  try {
    map.moveLayer(BASE_LAYER_IDS.labels);
  } catch {
    // Ignore layer-order errors.
  }
}

/**
 * Fallback deep URL scanner.
 * Main path uses structured AOI02 product.layers.
 */
function collectUrlRecords(root) {
  const output = [];

  function walk(node, path = [], context = "") {
    if (node === null || node === undefined) return;

    if (typeof node === "string") {
      const urls = extractUrls(node);

      urls.forEach((url) => {
        if (looksLikeRelevantUrl(url)) {
          output.push({
            url,
            context: `${context} ${path.join(" ")} ${node}`.toLowerCase(),
          });
        }
      });

      return;
    }

    if (typeof node === "number" || typeof node === "boolean") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, path.concat(String(index)), context);
      });
      return;
    }

    if (typeof node === "object") {
      let localContext = "";

      for (const [key, value] of Object.entries(node)) {
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          localContext += ` ${key}:${value}`;
        }
      }

      for (const [key, value] of Object.entries(node)) {
        walk(value, path.concat(key), `${context} ${localContext}`);
      }
    }
  }

  walk(root);
  return dedupeRecords(output);
}

function extractUrls(value) {
  const variants = new Set([value]);

  try {
    variants.add(decodeURIComponent(value));
  } catch {
    // Ignore invalid encoded strings.
  }

  const urls = [];

  for (const text of variants) {
    const matches = text.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];

    for (const match of matches) {
      urls.push(
        match
          .replace(/&amp;/g, "&")
          .replace(/[),.;\]]+$/g, "")
          .trim()
      );
    }
  }

  return urls;
}

function looksLikeRelevantUrl(url) {
  const text = url.toLowerCase();

  if (text.includes(".zip") || text.includes(".sld")) {
    return false;
  }

  return (
    text.endsWith(".json") ||
    text.includes(".tif") ||
    text.includes("builtupa") ||
    text.includes("built_up_a") ||
    text.includes("built-up-a") ||
    text.includes("builtupp") ||
    text.includes("built_up_p") ||
    text.includes("built-up-p") ||
    text.includes("transportationl") ||
    text.includes("transportation_l") ||
    text.includes("transportation-l") ||
    text.includes("transportationa") ||
    text.includes("transportation_a") ||
    text.includes("transportation-a") ||
    text.includes("facilitiesa") ||
    text.includes("facilities_a") ||
    text.includes("facilities-a") ||
    text.includes("ancillarycrisisinfop") ||
    text.includes("ancillary_crisis_info_p") ||
    text.includes("ancillary-crisis-info-p") ||
    text.includes("notanalyseda") ||
    text.includes("not_analysed_a") ||
    text.includes("not-analysed-a") ||
    text.includes("groundmovementa") ||
    text.includes("ground_movement_a") ||
    text.includes("ground-movement-a") ||
    text.includes("groundmovement") ||
    text.includes("ground_movement") ||
    text.includes("ground-movement")
  );
}

function dedupeRecords(records) {
  const seen = new Set();
  const deduped = [];

  for (const record of records) {
    if (seen.has(record.url)) continue;
    seen.add(record.url);
    deduped.push(record);
  }

  return deduped;
}

function pickLayerUrls(records) {
  const caracasRecords = records.filter((record) =>
    isCaracasRecord(`${record.url} ${record.context}`)
  );

  const candidates = caracasRecords.length > 0 ? caracasRecords : records;

  return {
    builtUpA: findBestLayerUrl(candidates, records, "builtUpA"),
    builtUpP: findBestLayerUrl(candidates, records, "builtUpP"),
    transportationL: findBestLayerUrl(candidates, records, "transportationL"),
    notAnalysedA: findBestLayerUrl(candidates, records, "notAnalysedA"),
    groundMovementA: findBestLayerUrl(candidates, records, "groundMovementA"),
  };
}

function findBestLayerUrl(primaryRecords, fallbackRecords, layerName) {
  const primary = bestLayerRecord(primaryRecords, layerName);
  if (primary) return primary.url;

  const fallback = bestLayerRecord(fallbackRecords, layerName);
  return fallback ? fallback.url : "";
}

function bestLayerRecord(records, layerName) {
  const matching = records.filter((record) => {
    return classifyLayer(`${record.url} ${record.context}`) === layerName;
  });

  matching.sort((a, b) => scoreRecord(b, layerName) - scoreRecord(a, layerName));

  return matching[0] || null;
}

function scoreRecord(record, layerName) {
  const text = `${record.url} ${record.context}`.toLowerCase();

  let score = 0;

  if (classifyLayer(text) === layerName) score += 50;
  if (isCaracasRecord(text)) score += 40;
  if (text.endsWith(".json")) score += 80;
  if (text.includes("rapidmapping-viewer")) score += 30;
  if (text.includes("amazonaws")) score += 30;
  if (text.includes("_vt")) score += 15;
  if (text.includes("format:vt")) score += 15;

  if (text.includes(".tif")) score -= 200;
  if (text.includes(".zip")) score -= 200;
  if (text.includes(".sld")) score -= 100;

  return score;
}

function isCaracasRecord(text, ...values) {
  const rawText =
    Array.isArray(text) && Object.prototype.hasOwnProperty.call(text, "raw")
      ? text.reduce(
          (acc, part, index) =>
            `${acc}${part}${index < values.length ? values[index] : ""}`,
          ""
        )
      : String(text || "");

  const lower = rawText.toLowerCase();

  return (
    lower.includes("caracas") ||
    /\baoi\s*0?2\b/.test(lower) ||
    /aoi[_-]?0?2/.test(lower) ||
    /aois[_-]?0?2/.test(lower) ||
    /emsr884[_-]?0?2/.test(lower) ||
    /[_/-]0?2[_/-]/.test(lower)
  );
}

function classifyLayer(text, ...values) {
  const rawText =
    Array.isArray(text) && Object.prototype.hasOwnProperty.call(text, "raw")
      ? text.reduce(
          (acc, part, index) =>
            `${acc}${part}${index < values.length ? values[index] : ""}`,
          ""
        )
      : String(text || "");

  const lower = rawText.toLowerCase();

  if (
    lower.includes("ancillarycrisisinfop") ||
    lower.includes("ancillary_crisis_info_p") ||
    lower.includes("ancillary-crisis-info-p") ||
    lower.includes("ancillary crisis info p") ||
    lower.includes("crisisinfop") ||
    lower.includes("crisis_info_p") ||
    lower.includes("crisis-info-p")
  ) {
    return "ancillaryCrisisInfoP";
  }

  if (
    lower.includes("builtupa") ||
    lower.includes("built_up_a") ||
    lower.includes("built-up-a") ||
    lower.includes("built up a")
  ) {
    return "builtUpA";
  }

  if (
    lower.includes("builtupp") ||
    lower.includes("built_up_p") ||
    lower.includes("built-up-p") ||
    lower.includes("built up p") ||
    lower.includes("built up point") ||
    lower.includes("builduppoints") ||
    lower.includes("built-up points")
  ) {
    return "builtUpP";
  }

  if (
    lower.includes("facilitiesa") ||
    lower.includes("facilities_a") ||
    lower.includes("facilities-a") ||
    lower.includes("facilities a") ||
    lower.includes("facilitya") ||
    lower.includes("facility_a") ||
    lower.includes("facility-a")
  ) {
    return "facilitiesA";
  }

  if (
    lower.includes("transportationa") ||
    lower.includes("transportation_a") ||
    lower.includes("transportation-a") ||
    lower.includes("transportation a")
  ) {
    return "transportationA";
  }

  if (
    lower.includes("transportationl") ||
    lower.includes("transportation_l") ||
    lower.includes("transportation-l") ||
    lower.includes("transportation l")
  ) {
    return "transportationL";
  }

  if (
    lower.includes("notanalyseda") ||
    lower.includes("not_analysed_a") ||
    lower.includes("not-analysed-a") ||
    lower.includes("not analysed a") ||
    lower.includes("notanalyzeda") ||
    lower.includes("not_analyzed_a") ||
    lower.includes("not-analyzed-a")
  ) {
    return "notAnalysedA";
  }

  if (
    lower.includes("groundmovementa") ||
    lower.includes("ground_movement_a") ||
    lower.includes("ground-movement-a") ||
    lower.includes("ground movement a") ||
    lower.includes("groundmovement") ||
    lower.includes("ground_movement") ||
    lower.includes("ground-movement") ||
    lower.includes("ground movement")
  ) {
    return "groundMovementA";
  }

  return "";
}


function noVisibleDamageExpression() {
  const damage = damageTextExpression();

  return [
    "any",
    [">=", ["index-of", "no visible", damage], 0],
    [">=", ["index-of", "no damage", damage], 0],
    [">=", ["index-of", "not damaged", damage], 0],
  ];
}

function possibleDamageExpression() {
  const damage = damageTextExpression();

  return [
    "any",
    [">=", ["index-of", "possible", damage], 0],
    [">=", ["index-of", "possibly", damage], 0],
    [">=", ["index-of", "posible", damage], 0],
  ];
}

function destroyedDamageExpression() {
  const damage = damageTextExpression();

  return [
    "any",
    [">=", ["index-of", "destroy", damage], 0],
    [">=", ["index-of", "destruid", damage], 0],
    [">=", ["index-of", "destru", damage], 0],
  ];
}

function anyDamagedExpression() {
  const damage = damageTextExpression();

  return [
    "any",
    [">=", ["index-of", "damag", damage], 0],
    [">=", ["index-of", "dañ", damage], 0],
    [">=", ["index-of", "danno", damage], 0],
  ];
}

function confirmedDamagedExpression() {
  return [
    "all",
    anyDamagedExpression(),
    ["!", possibleDamageExpression()],
    ["!", destroyedDamageExpression()],
    ["!", noVisibleDamageExpression()],
  ];
}

function hiddenDamageExpression() {
  return ["==", ["get", "__never_show_this__"], "__hidden__"];
}

function visibleAllFilterExpression() {
  return ["!=", ["get", "__never_show_this__"], "__hidden__"];
}

function buildDamageLayerFilterForKind(kind) {
  const activeFilters = [];

  if (getLayerVisibility(`${kind}:possible`, true)) {
    activeFilters.push(possibleDamageExpression());
  }

  if (getLayerVisibility(`${kind}:damaged`, true)) {
    activeFilters.push(confirmedDamagedExpression());
  }

  if (getLayerVisibility(`${kind}:destroyed`, true)) {
    activeFilters.push(destroyedDamageExpression());
  }

  if (activeFilters.length === 0) {
    return hiddenDamageExpression();
  }

  return ["any", ...activeFilters];
}

function transportationAreaFilterExpression() {
  return getLayerVisibility("transportationA:airfieldAndHeliportDamaged", true)
    ? visibleAllFilterExpression()
    : hiddenDamageExpression();
}

function ancillaryCrisisInfoFilterExpression() {
  return getLayerVisibility("ancillaryCrisisInfoP:blockedRoadInterruption", true)
    ? visibleAllFilterExpression()
    : hiddenDamageExpression();
}

function buildDamageLayerFilter() {
  const activeFilters = [];

  if (layerVisibility.possible) {
    activeFilters.push(possibleDamageExpression());
  }

  if (layerVisibility.damaged) {
    activeFilters.push(confirmedDamagedExpression());
  }

  if (layerVisibility.destroyed) {
    activeFilters.push(destroyedDamageExpression());
  }

  if (activeFilters.length === 0) {
    return hiddenDamageExpression();
  }

  return ["any", ...activeFilters];
}

/**
 * Overrides the earlier generic damageFilterExpression.
 * This version responds to legend checkbox state.
 */
function damageFilterExpression() {
  return buildDamageLayerFilter();
}

function applyLayerVisibility() {
  syncLayerToggleInputs();
  updateLegendAvailability();

  if (!mapReady || !map) {
    return;
  }

  const builtUpAreaFilter = buildDamageLayerFilterForKind("builtUpA");
  const builtUpPointFilter = buildDamageLayerFilterForKind("builtUpP");
  const facilitiesFilter = buildDamageLayerFilterForKind("facilitiesA");
  const transportationAreaFilter = transportationAreaFilterExpression();
  const crisisFilter = ancillaryCrisisInfoFilterExpression();

  ["built-up-fill", "built-up-outline"].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, builtUpAreaFilter);
    }
  });

  ["built-up-point-halo", "built-up-point-circle"].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, builtUpPointFilter);
    }
  });

  ["facilities-area-fill", "facilities-area-outline"].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, facilitiesFilter);
    }
  });

  ["transportation-area-fill", "transportation-area-outline"].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, transportationAreaFilter);
    }
  });

  ["crisis-point-halo", "crisis-point-circle"].forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, crisisFilter);
    }
  });

  setLayerVisibility(
    "transportation-highway-line",
    getLayerVisibility("transportationL:highway", layerVisibility.transportHighway !== false)
  );

  setLayerVisibility(
    "transportation-main-road-line",
    getLayerVisibility("transportationL:main", layerVisibility.transportMain !== false)
  );

  setLayerVisibility(
    "transportation-local-road-line",
    getLayerVisibility("transportationL:local", layerVisibility.transportLocal !== false)
  );

  setLayerVisibility(
    "transportation-track-line",
    getLayerVisibility("transportationL:track", layerVisibility.transportTrack !== false)
  );

  setLayerVisibility(
    "transportation-airfield-runway-line",
    getLayerVisibility("transportationL:airfieldRunway", layerVisibility.transportAirfieldRunway !== false)
  );

  const showRailway = getLayerVisibility(
    "transportationL:railway",
    layerVisibility.transportRailway !== false
  );
  setLayerVisibility("transportation-railway-line", showRailway);
  setLayerVisibility("transportation-railway-ticks", showRailway);

  GROUND_MOVEMENT_CLASSES.forEach((item) => {
    const visible = getLayerVisibility(`groundMovementA:${item.key}`, layerVisibility[item.key] !== false);
    setLayerVisibility(`ground-movement-${item.id}-fill`, visible);
    setLayerVisibility(`ground-movement-${item.id}-outline`, visible);
  });

  const showNotAnalysed = getLayerVisibility("notAnalysedA:default", false);

  setLayerVisibility("not-analysed-fill", showNotAnalysed);
  setLayerVisibility("not-analysed-hatch-fill", showNotAnalysed);
  setLayerVisibility("not-analysed-outline", showNotAnalysed);

  const showAoi = getLayerVisibility("aoi:default", layerVisibility.aoi !== false);

  AOI_LAYER_IDS.forEach((layerId) => {
    setLayerVisibility(layerId, showAoi);
  });

  syncLayerToggleInputs();
  updateLegendAvailability();
}


function setStatus(type, title, message, showRetry) {
  els.status.classList.remove("hidden", "loading", "success", "error");
  els.status.classList.add(type);

  els.statusTitle.textContent = title;
  els.statusMessage.textContent = message;
  els.retry.classList.toggle("hidden", !showRetry);
}

/* Inline product selector and product comparison override: start */
var PRODUCT_ALL_KEY_V4 = "__all__";
var DYNAMIC_DATA_LAYER_IDS_V4 = new Set();
var DYNAMIC_SOURCE_IDS_V4 = new Set();

function safeMapIdV4(value) {
  return String(value || "default")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default";
}

function isAllProductsSelectedV4() {
  return selectedProductKey === PRODUCT_ALL_KEY_V4 || selectedProductKey === "all";
}

function visibilityKeyV4(productKey, kind, className) {
  return `${safeMapIdV4(productKey)}:${kind}:${className}`;
}

function productLayerIdV4(meta, baseId) {
  return `${baseId}-${safeMapIdV4(meta?.productKey || "default")}`;
}

function getLoadedSourceMetasV4(kind, productKey = "") {
  return Object.values(loadedSourceMeta || {}).filter((meta) => {
    if (!meta || meta.kind !== kind) return false;
    if (productKey && String(meta.productKey) !== String(productKey)) return false;
    return true;
  });
}

function getLoadedSourceMetaV4(kind, productKey = "") {
  return getLoadedSourceMetasV4(kind, productKey)[0] || null;
}

function getSelectedProductsForAoiV4(aoi, products = getProductsSortedForAoi(aoi)) {
  const sorted = Array.isArray(products) ? products : [];
  const useful = sorted.filter(productHasUsefulLayers);

  if (isAllProductsSelectedV4()) {
    return useful.length ? useful : sorted.slice(0, 1);
  }

  const selected = chooseSelectedProductForAoi(aoi, sorted);
  return selected ? [selected] : [];
}

function formatProductStatusLineV4(product) {
  const available = productHasUsefulLayers(product);
  const status = getAoiCardStatusText(product, available);
  const time = formatProductSituationLabel(product);
  return `${status}${time ? ` · ${time}` : ""}`;
}

function renderInlineProductOptionsV4(aoi) {
  const products = getProductsSortedForAoi(aoi);
  const usefulProducts = products.filter(productHasUsefulLayers);

  if (products.length <= 1) {
    return "";
  }

  const selectedProducts = getSelectedProductsForAoiV4(aoi, products);
  const selectedKeys = new Set(selectedProducts.map(getProductKey));
  const selectedSingleKey = selectedProducts.length === 1 ? getProductKey(selectedProducts[0]) : "";
  const defaultSelected = selectedSingleKey || getProductKey(products[0]);

  const allButton = usefulProducts.length > 1
    ? `
      <button
        class="aoi-product-chip ${isAllProductsSelectedV4() ? "active-product-chip" : ""}"
        type="button"
        data-product-key="${PRODUCT_ALL_KEY_V4}"
      >
        <strong>${escapeHtml(t("allProducts"))}</strong>
        <small>${escapeHtml(usefulProducts.map(getProductLabel).join(" + "))}</small>
      </button>
    `
    : "";

  const productButtons = products.map((product) => {
    const productKey = getProductKey(product);
    const active = isAllProductsSelectedV4()
      ? selectedKeys.has(productKey)
      : selectedProductKey
        ? productKey === selectedSingleKey
        : productKey === defaultSelected;
    const available = productHasUsefulLayers(product);
    const statusCode = product?.version?.statusCode || "";
    const dotClass = available ? "green" : statusCode === "N" ? "red" : "amber";

    return `
      <button
        class="aoi-product-chip ${active ? "active-product-chip" : ""} ${available ? "" : "disabled-product-chip"}"
        type="button"
        data-product-key="${escapeHtml(productKey)}"
      >
        <span class="status-dot ${dotClass}" aria-hidden="true"></span>
        <span>
          <strong>${escapeHtml(getProductLabel(product))}</strong>
          <small>${escapeHtml(formatProductStatusLineV4(product))}</small>
        </span>
      </button>
    `;
  }).join("");

  return `
    <div class="aoi-product-options" aria-label="Product selector">
      ${allButton}
      ${productButtons}
    </div>
  `;
}

function renderAoiList(aois = latestAois) {
  if (!els.aoiList || !Array.isArray(aois) || !aois.length) {
    return;
  }

  els.aoiList.innerHTML = aois
    .map((aoi) => {
      const product = chooseAoiProduct(aoi);
      const available = productHasUsefulLayers(product);
      const selected = Number(aoi.number) === Number(selectedAoiNumber);

      const numberText = String(aoi.number).padStart(2, "0");
      const name = aoi.name || `AOI${numberText}`;
      const statusCode = product?.version?.statusCode || "";

      const dotClass = available ? "green" : statusCode === "N" ? "red" : "amber";

      const classes = [
        "aoi-card",
        available ? "available-aoi" : "disabled placeholder-aoi",
        selected ? "active-aoi" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const productLabel = getProductLabel(product);
      const statusText = getAoiCardStatusText(product, available);

      return `
        <div class="aoi-entry ${selected ? "selected-aoi-entry" : ""}">
          <button
            class="${classes}"
            type="button"
            data-aoi-number="${Number(aoi.number)}"
            aria-disabled="${available ? "false" : "true"}"
          >
            <span class="status-dot ${dotClass}" aria-hidden="true"></span>
            <span>
              <strong>${escapeHtml(numberText)} ${escapeHtml(name)}</strong>
              <small>${escapeHtml(productLabel)} · ${escapeHtml(statusText)}</small>
            </span>
          </button>
          ${selected ? renderInlineProductOptionsV4(aoi) : ""}
        </div>
      `;
    })
    .join("");
}

function renderProductSelector(products = currentProductOptions, selectedProduct = latestSelectedProductInfo?.product || null) {
  currentProductOptions = Array.isArray(products) ? products : [];

  if (els.productPanel) {
    els.productPanel.classList.add("hidden");
  }

  if (els.productList) {
    els.productList.innerHTML = "";
  }
}

function setupUiEvents() {
  const oldCaracasButton = document.getElementById("load-caracas");

  if (oldCaracasButton) {
    oldCaracasButton.addEventListener("click", () => {
      selectedAoiNumber = 2;
      selectedProductKey = "";
      updateAoiUrlParam(2);
      clearSelectedProductUrlParam();
      closeMobileSidebar();
      loadAoi(2);
    });
  }

  if (els.aoiList) {
    els.aoiList.addEventListener("click", (event) => {
      const productButton = event.target.closest("[data-product-key]");

      if (productButton) {
        event.preventDefault();
        event.stopPropagation();

        const nextProductKey = String(productButton.dataset.productKey || "").trim();

        if (!nextProductKey) {
          return;
        }

        selectedProductKey = nextProductKey;
        updateSelectedProductUrlParam(nextProductKey);
        loadAoi(selectedAoiNumber);
        return;
      }

      const button = event.target.closest("[data-aoi-number]");
      if (!button) return;

      const aoiNumber = Number(button.dataset.aoiNumber);

      if (!Number.isFinite(aoiNumber)) {
        return;
      }

      selectedAoiNumber = aoiNumber;
      selectedProductKey = "";
      updateAoiUrlParam(aoiNumber);
      clearSelectedProductUrlParam();
      closeMobileSidebar();
      loadAoi(aoiNumber);
    });
  }

  const sidebarToggle = document.getElementById("sidebar-toggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });
  }

  if (els.retry) {
    els.retry.addEventListener("click", () => {
      loadAoi(selectedAoiNumber);
    });
  }

  const refreshDataButton = document.getElementById("refresh-data-btn");
  if (refreshDataButton) {
    refreshDataButton.addEventListener("click", forceRefreshCopernicusData);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileSidebar();
    }
  });
}

function setupLayerToggleEvents() {
  const legend = document.getElementById("map-legend");

  if (!legend || legend.dataset.toggleDelegatedV4 === "1") {
    return;
  }

  legend.dataset.toggleDelegatedV4 = "1";

  legend.addEventListener("change", (event) => {
    const labelsInput = event.target.closest("[data-basemap-labels-toggle]");

    if (labelsInput) {
      satelliteLabelsEnabled = Boolean(labelsInput.checked);

      if (els.labelsToggle) {
        els.labelsToggle.checked = satelliteLabelsEnabled;
      }

      setBasemap(currentBasemap);
      renderDynamicLegend(latestSelectedProductInfo);
      return;
    }

    const input = event.target.closest("[data-layer-toggle]");

    if (!input) {
      return;
    }

    const key = String(input.dataset.layerToggle || "").trim();

    if (!key) {
      return;
    }

    setLayerVisibilityState(key, input.checked);
    syncLayerToggleInputs();
    applyLayerVisibility();
  });

  syncLayerToggleInputs();
}

function clearCopernicusDataLayers() {
  if (!map) return;

  const layerIds = new Set([
    ...DATA_LAYER_IDS,
    ...DYNAMIC_DATA_LAYER_IDS_V4,
  ]);

  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }

  const sourceIds = new Set([
    ...Object.values(SOURCE_IDS),
    ...DYNAMIC_SOURCE_IDS_V4,
  ]);

  for (const sourceId of sourceIds) {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }

    delete loadedSourceMeta[sourceId];
  }

  DYNAMIC_DATA_LAYER_IDS_V4.clear();
  DYNAMIC_SOURCE_IDS_V4.clear();
}

async function getCopernicusLayerInfo(aoiNumber = selectedAoiNumber) {
  const overrides = cleanOverrideUrls(COPERNICUS_URL_OVERRIDES);

  const manifestInfo = await getCachedCopernicusManifest();
  const manifest = manifestInfo.manifest;

  latestAois = getAllAois(manifest);
  renderAoiList(latestAois);

  const aoi = findAoiByNumber(manifest, aoiNumber);

  if (!aoi) {
    throw new Error(
      `AOI${String(aoiNumber).padStart(2, "0")} not found in EMSR884 manifest.`
    );
  }

  const productOptions = getProductsSortedForAoi(aoi);
  const selectedProducts = getSelectedProductsForAoiV4(aoi, productOptions);
  const primaryProduct = selectedProducts[0] || chooseSelectedProductForAoi(aoi, productOptions);

  if (!selectedProducts.length && !primaryProduct) {
    updateDataStatusPanel({
      activationCode: "EMSR884",
      aoiName: aoi.name || `AOI${String(aoi.number).padStart(2, "0")}`,
      aoiNumber: aoi.number,
      lastChecked: manifestInfo.checkedAt,
      fromCache: manifestInfo.fromCache,
      cacheStale: manifestInfo.stale,
      cacheAgeMs: manifestInfo.cacheAgeMs,
      reportLink: manifest?.results?.[0]?.reportLink || "",
      productsPath: manifest?.results?.[0]?.productsPath || "",
    });

    return {
      manifest,
      manifestInfo,
      aoi,
      product: null,
      products: [],
      productOptions,
      productLayerEntries: [],
      urls: {},
      cogLayers: [],
    };
  }

  if (!selectedProductKey && primaryProduct) {
    selectedProductKey = getProductKey(primaryProduct);
  }

  const effectiveProducts = selectedProducts.length ? selectedProducts : [primaryProduct];

  const productLayerEntries = effectiveProducts.map((product) => {
    const urls = extractLayerUrlsFromProduct(product);

    // Manual overrides are only safe for single-product mode.
    if (effectiveProducts.length === 1) {
      Object.assign(urls, overrides);
    }

    return {
      product,
      productKey: getProductKey(product),
      productLabel: getProductLabel(product),
      urls,
    };
  });

  const cogLayers = effectiveProducts.flatMap((product) =>
    extractCogLayersFromProduct(product, manifest).map((item) => ({
      ...item,
      product,
      productKey: getProductKey(product),
      productLabel: getProductLabel(product),
    }))
  );

  updateDataStatusPanel({
    activationCode: "EMSR884",
    aoiName: aoi.name || `AOI${String(aoi.number).padStart(2, "0")}`,
    aoiNumber: aoi.number,

    productId: effectiveProducts.length === 1 ? effectiveProducts[0]?.id || "" : "",
    productType: effectiveProducts.length === 1 ? effectiveProducts[0]?.type || "" : "",
    productStatus: effectiveProducts.length === 1 ? effectiveProducts[0]?.version?.statusCode || "" : "",
    productSummary: isAllProductsSelectedV4()
      ? `${t("allProducts")} · ${formatProductListLabel(effectiveProducts)}`
      : formatProductListLabel(effectiveProducts),

    deliveryTime: getLatestProductDeliveryTime(effectiveProducts),
    expectedDelivery: getLatestProductExpectedDelivery(effectiveProducts),
    acquisitionTime: getLatestAcquisitionTimeFromProducts(effectiveProducts),

    lastChecked: manifestInfo.checkedAt,
    fromCache: manifestInfo.fromCache,
    cacheStale: manifestInfo.stale,
    cacheAgeMs: manifestInfo.cacheAgeMs,
    reportLink: manifest?.results?.[0]?.reportLink || "",
    productsPath: manifest?.results?.[0]?.productsPath || "",
    downloadPath: effectiveProducts.length === 1 ? effectiveProducts[0]?.downloadPath || "" : manifest?.results?.[0]?.productsPath || "",
  });

  renderProductSelector(productOptions, primaryProduct);

  console.info("Selected Copernicus AOI/product mode/layers:", {
    aoiName: aoi.name,
    aoiNumber: aoi.number,
    allProducts: isAllProductsSelectedV4(),
    products: effectiveProducts.map((product) => ({
      id: product.id,
      type: product.type,
      monitoring: product.monitoring,
      monitoringNumber: product.monitoringNumber,
      status: product.version?.statusCode,
    })),
    productLayerEntries,
    cogLayers,
  });

  return {
    manifest,
    manifestInfo,
    aoi,
    product: primaryProduct,
    products: effectiveProducts,
    productOptions,
    productLayerEntries,
    urls: productLayerEntries[0]?.urls || {},
    cogLayers,
  };
}

async function loadAoi(aoiNumber = selectedAoiNumber) {
  if (!mapReady || isLoading) return;

  const nextAoiNumber = Number(aoiNumber);
  selectedAoiNumber = Number.isFinite(nextAoiNumber)
    ? nextAoiNumber
    : DEFAULT_AOI_NUMBER;

  isLoading = true;

  latestDataStatusMeta = {};
  latestSelectedProductInfo = null;
  renderDataStatusPanel();

  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  try {
    clearCopernicusDataLayers();

    const info = await getCopernicusLayerInfo(selectedAoiNumber);
    latestSelectedProductInfo = info;

    renderAoiList(latestAois);
    fitAoiExtent(info.aoi);
    showAoiExtent(info.aoi);

    const wantedOrder = [
      "notAnalysedA",
      "groundMovementA",
      "transportationA",
      "facilitiesA",
      "builtUpA",
      "builtUpP",
      "ancillaryCrisisInfoP",
      "transportationL",
    ];

    const layerJobs = [];

    for (const entry of info.productLayerEntries || []) {
      for (const kind of wantedOrder) {
        const url = entry.urls?.[kind];

        if (url) {
          layerJobs.push([kind, url, entry.product]);
        }
      }
    }

    const results = [];

    for (const [kind, url, product] of layerJobs) {
      try {
        const value = await addCopernicusLayer(kind, url, product);
        results.push({ status: "fulfilled", value, kind, product });
      } catch (error) {
        console.warn(`Layer ${kind} failed:`, error);
        results.push({ status: "rejected", reason: error, kind, product });
      }
    }

    const loadedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value === true
    ).length;

    showAoiExtent(info.aoi);
    moveLabelsToTop();
    renderDynamicLegend(info);
    applyLayerVisibility();

    if (loadedCount === 0) {
      console.warn("Copernicus layer load results:", results);

      setStatus(
        "error",
        t("aoiUnavailableTitle"),
        `${formatAoiLabel(info.aoi)} · ${formatProductListLabel(info.products || []) || getProductLabel(info.product)} — ${t("aoiUnavailableText")}`,
        false
      );

      updateDataStatusPanel({
        successfulLoadTime: "",
        loadedLayerCount: 0,
      });

      return;
    }

    updateDataStatusPanel({
      successfulLoadTime: new Date().toISOString(),
      loadedLayerCount: loadedCount,
    });

    renderAoiList(latestAois);

    setStatus(
      "success",
      t("loadedTitle"),
      `${formatAoiLabel(info.aoi)} · ${formatProductListLabel(info.products || []) || getProductLabel(info.product)} — ${t("loadedText")}`,
      false
    );

    window.setTimeout(() => {
      if (els.status.classList.contains("success")) {
        els.status.classList.add("hidden");
      }
    }, 5500);
  } catch (error) {
    console.error(error);

    setStatus(
      "error",
      t("unavailableTitle"),
      `${t("unavailableText")}${error.message ? ` (${error.message})` : ""}`,
      true
    );
  } finally {
    isLoading = false;
  }
}

async function addCopernicusLayer(kind, url, product = null) {
  maybeShowLargeLayerDownloadNotice(kind, url);

  const meta = await ensureCopernicusSource(kind, url, product);

  if (kind === "builtUpA") {
    addBuiltUpStyleLayers(meta);
  } else if (kind === "builtUpP") {
    addBuiltUpPointStyleLayers(meta);
  } else if (kind === "transportationL") {
    addTransportationStyleLayer(meta);
  } else if (kind === "transportationA") {
    addTransportationAreaStyleLayers(meta);
  } else if (kind === "facilitiesA") {
    addFacilitiesAreaStyleLayers(meta);
  } else if (kind === "ancillaryCrisisInfoP") {
    addAncillaryCrisisInfoStyleLayers(meta);
  } else if (kind === "notAnalysedA") {
    addNotAnalysedStyleLayers(meta);
  } else if (kind === "groundMovementA") {
    addGroundMovementStyleLayers(meta);
  } else {
    throw new Error(`Unknown Copernicus layer kind: ${kind}`);
  }

  applyLayerVisibility();

  console.info(`Added Copernicus layer ${kind}:`, meta);
  return true;
}

async function ensureCopernicusSource(kind, url, product = null) {
  const baseSourceId = SOURCE_IDS[kind];

  if (!baseSourceId) {
    throw new Error(`No source id configured for ${kind}`);
  }

  const productKey = product ? getProductKey(product) : "default";
  const sourceId = `${baseSourceId}-${safeMapIdV4(productKey)}`;

  if (map.getSource(sourceId) && loadedSourceMeta[sourceId]) {
    return loadedSourceMeta[sourceId];
  }

  const json = await fetchJsonDocument(url, `${kind} Copernicus JSON`, {
    cacheDocument: true,
    fetchCache: "force-cache",
  });

  console.info(`Fetched ${kind} JSON summary:`, summarizeJson(json, url));

  if (isGeoJson(json)) {
    const geojson = normalizeGeoJson(json);
    const featureSummary = summarizeLayerFeatures(kind, geojson.features || []);

    map.addSource(sourceId, {
      type: "geojson",
      data: geojson,
      generateId: true,
    });

    DYNAMIC_SOURCE_IDS_V4.add(sourceId);

    loadedSourceMeta[sourceId] = {
      kind,
      sourceId,
      sourceType: "geojson",
      sourceLayer: null,
      url,
      product,
      productKey,
      productLabel: getProductLabel(product),
      featureCount: Array.isArray(geojson.features) ? geojson.features.length : null,
      ...featureSummary,
    };

    return loadedSourceMeta[sourceId];
  }

  if (isTileJson(json)) {
    const tiles = Array.isArray(json.tiles)
      ? json.tiles.map((tile) => resolveTileUrl(tile, url))
      : [];

    if (!tiles.length) {
      throw new Error(
        `${kind}: JSON looks like TileJSON but has no tiles[] array. Keys: ${Object.keys(
          json
        ).join(", ")}`
      );
    }

    const sourceLayer = detectVectorSourceLayer(json, kind, url);

    if (!sourceLayer) {
      throw new Error(`${kind}: Could not detect vector source-layer from TileJSON.`);
    }

    const sourceDefinition = {
      type: "vector",
      tiles,
    };

    const minzoom = Number(json.minzoom);
    const maxzoom = Number(json.maxzoom);

    if (Number.isFinite(minzoom)) sourceDefinition.minzoom = minzoom;
    if (Number.isFinite(maxzoom)) sourceDefinition.maxzoom = maxzoom;
    if (json.scheme) sourceDefinition.scheme = json.scheme;

    if (Array.isArray(json.bounds) && json.bounds.length === 4) {
      sourceDefinition.bounds = json.bounds;
    }

    if (json.attribution) {
      sourceDefinition.attribution = json.attribution;
    }

    map.addSource(sourceId, sourceDefinition);
    DYNAMIC_SOURCE_IDS_V4.add(sourceId);

    loadedSourceMeta[sourceId] = {
      kind,
      sourceId,
      sourceType: "vector",
      sourceLayer,
      url,
      product,
      productKey,
      productLabel: getProductLabel(product),
      tiles,
      tileJsonKeys: Object.keys(json),
    };

    return loadedSourceMeta[sourceId];
  }

  throw new Error(
    `${kind}: Unsupported Copernicus JSON. It is neither GeoJSON nor TileJSON. Keys: ${Object.keys(
      json || {}
    ).join(", ")}`
  );
}

function addOrReplaceDataLayer(layerDefinition) {
  if (map.getLayer(layerDefinition.id)) {
    map.removeLayer(layerDefinition.id);
  }

  const beforeId = map.getLayer(BASE_LAYER_IDS.labels)
    ? BASE_LAYER_IDS.labels
    : undefined;

  try {
    map.addLayer(layerDefinition, beforeId);
    DYNAMIC_DATA_LAYER_IDS_V4.add(layerDefinition.id);
  } catch (error) {
    console.error("Failed to add layer:", layerDefinition);
    throw error;
  }
}

function buildDamageLayerFilterForMetaV4(meta) {
  const productKey = meta?.productKey || "default";
  const kind = meta?.kind || "builtUpA";
  const activeFilters = [];

  if (getLayerVisibility(visibilityKeyV4(productKey, kind, "possible"), true)) {
    activeFilters.push(possibleDamageExpression());
  }

  if (getLayerVisibility(visibilityKeyV4(productKey, kind, "damaged"), true)) {
    activeFilters.push(confirmedDamagedExpression());
  }

  if (getLayerVisibility(visibilityKeyV4(productKey, kind, "destroyed"), true)) {
    activeFilters.push(destroyedDamageExpression());
  }

  if (activeFilters.length === 0) {
    return hiddenDamageExpression();
  }

  return ["any", ...activeFilters];
}

function visibleAllFilterExpressionV4() {
  return ["!=", ["get", "__never_show_this__"], "__hidden__"];
}

function transportationAreaFilterExpressionV4(meta) {
  return getLayerVisibility(
    visibilityKeyV4(meta?.productKey || "default", "transportationA", "airfieldAndHeliportDamaged"),
    true
  )
    ? visibleAllFilterExpressionV4()
    : hiddenDamageExpression();
}

function ancillaryCrisisInfoFilterExpressionV4(meta) {
  return getLayerVisibility(
    visibilityKeyV4(meta?.productKey || "default", "ancillaryCrisisInfoP", "blockedRoadInterruption"),
    true
  )
    ? visibleAllFilterExpressionV4()
    : hiddenDamageExpression();
}

function addBuiltUpStyleLayers(meta) {
  const color = damageColorExpression();

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "built-up-fill"),
        type: "fill",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMetaV4(meta),
        paint: {
          "fill-color": color,
          "fill-opacity": 0.78,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "built-up-outline"),
        type: "line",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMetaV4(meta),
        paint: {
          "line-color": color,
          "line-opacity": 0.95,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.8,
            13,
            1.5,
            16,
            2.4,
          ],
        },
      },
      meta
    )
  );
}

function addBuiltUpPointStyleLayers(meta) {
  const color = damageColorExpression();

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "built-up-point-halo"),
        type: "circle",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMetaV4(meta),
        paint: {
          "circle-color": "rgba(255, 255, 255, 0.92)",
          "circle-opacity": 0.78,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            4.5,
            13,
            6.8,
            16,
            10.5,
          ],
          "circle-stroke-color": "rgba(0, 0, 0, 0.58)",
          "circle-stroke-width": 1,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "built-up-point-circle"),
        type: "circle",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMetaV4(meta),
        paint: {
          "circle-color": color,
          "circle-opacity": 0.98,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3.2,
            13,
            5,
            16,
            8.2,
          ],
          "circle-stroke-color": "rgba(255, 255, 255, 0.95)",
          "circle-stroke-width": 1.1,
        },
      },
      meta
    )
  );
}

function addFacilitiesAreaStyleLayers(meta) {
  const color = damageColorExpression();

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "facilities-area-fill"),
        type: "fill",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMetaV4(meta),
        paint: {
          "fill-color": color,
          "fill-opacity": 0.55,
          "fill-outline-color": "rgba(255, 0, 255, 0.9)",
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "facilities-area-outline"),
        type: "line",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMetaV4(meta),
        paint: {
          "line-color": "rgba(255, 0, 255, 0.95)",
          "line-opacity": 0.95,
          "line-width": lineWidthExpression(0.8, 1.5, 2.5),
        },
      },
      meta
    )
  );
}

function addTransportationAreaStyleLayers(meta) {
  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "transportation-area-fill"),
        type: "fill",
        source: meta.sourceId,
        filter: transportationAreaFilterExpressionV4(meta),
        paint: {
          "fill-color": "rgba(245, 148, 0, 0.38)",
          "fill-opacity": 0.55,
          "fill-outline-color": "rgba(245, 148, 0, 0.95)",
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "transportation-area-outline"),
        type: "line",
        source: meta.sourceId,
        filter: transportationAreaFilterExpressionV4(meta),
        paint: {
          "line-color": "rgba(245, 148, 0, 0.98)",
          "line-opacity": 0.95,
          "line-width": lineWidthExpression(0.8, 1.6, 2.8),
        },
      },
      meta
    )
  );
}

function addAncillaryCrisisInfoStyleLayers(meta) {
  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "crisis-point-halo"),
        type: "circle",
        source: meta.sourceId,
        filter: ancillaryCrisisInfoFilterExpressionV4(meta),
        paint: {
          "circle-color": "rgba(255, 111, 0, 0.25)",
          "circle-opacity": 0.95,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            7,
            13,
            10,
            16,
            15,
          ],
          "circle-stroke-color": "rgba(255, 111, 0, 0.95)",
          "circle-stroke-width": 2.2,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "crisis-point-circle"),
        type: "circle",
        source: meta.sourceId,
        filter: ancillaryCrisisInfoFilterExpressionV4(meta),
        paint: {
          "circle-color": "rgba(8, 10, 14, 0.96)",
          "circle-opacity": 0.98,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3.5,
            13,
            5,
            16,
            8,
          ],
          "circle-stroke-color": "rgba(255, 111, 0, 1)",
          "circle-stroke-width": 2.4,
        },
      },
      meta
    )
  );
}

function addTransportationStyleLayer(meta) {
  const layers = [
    {
      baseId: "transportation-local-road-line",
      className: "local",
      filter: transportationClassFilter("local"),
      paint: {
        "line-color": "rgba(170, 174, 180, 0.92)",
        "line-opacity": 0.82,
        "line-width": lineWidthExpression(0.45, 1.0, 1.8),
      },
    },
    {
      baseId: "transportation-track-line",
      className: "track",
      filter: transportationClassFilter("track"),
      paint: {
        "line-color": "rgba(190, 194, 200, 0.96)",
        "line-opacity": 0.86,
        "line-width": lineWidthExpression(0.45, 1.0, 1.8),
        "line-dasharray": [2, 2],
      },
    },
    {
      baseId: "transportation-airfield-runway-line",
      className: "airfieldRunway",
      filter: transportationClassFilter("airfieldRunway"),
      paint: {
        "line-color": "rgba(222, 226, 230, 0.78)",
        "line-opacity": 0.82,
        "line-width": lineWidthExpression(0.7, 1.7, 3.0),
      },
    },
    {
      baseId: "transportation-main-road-line",
      className: "main",
      filter: transportationClassFilter("main"),
      paint: {
        "line-color": "rgba(246, 248, 250, 0.96)",
        "line-opacity": 0.9,
        "line-width": lineWidthExpression(0.65, 1.6, 2.8),
      },
    },
    {
      baseId: "transportation-highway-line",
      className: "highway",
      filter: transportationClassFilter("highway"),
      paint: {
        "line-color": "rgba(255, 180, 188, 0.98)",
        "line-opacity": 0.96,
        "line-width": lineWidthExpression(1.0, 2.6, 4.6),
      },
    },
    {
      baseId: "transportation-railway-line",
      className: "railway",
      filter: transportationClassFilter("railway"),
      paint: {
        "line-color": "rgba(8, 12, 18, 0.98)",
        "line-opacity": 0.96,
        "line-width": lineWidthExpression(0.7, 1.5, 2.4),
      },
    },
    {
      baseId: "transportation-railway-ticks",
      className: "railway",
      filter: transportationClassFilter("railway"),
      paint: {
        "line-color": "rgba(8, 12, 18, 0.98)",
        "line-opacity": 0.72,
        "line-width": lineWidthExpression(2.0, 3.4, 5.2),
        "line-dasharray": [0.1, 1.6],
      },
    },
  ];

  layers.forEach((layer) => {
    addOrReplaceDataLayer(
      withOptionalSourceLayer(
        {
          id: productLayerIdV4(meta, layer.baseId),
          type: "line",
          source: meta.sourceId,
          filter: layer.filter,
          layout: {
            "line-cap": "round",
            "line-join": "round",
          },
          paint: layer.paint,
        },
        meta
      )
    );
  });
}

function addNotAnalysedStyleLayers(meta) {
  if (!map.hasImage("not-analysed-hatch")) {
    addHatchPattern();
  }

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "not-analysed-fill"),
        type: "fill",
        source: meta.sourceId,
        paint: {
          "fill-color": "rgba(31, 36, 46, 0.88)",
          "fill-opacity": 0.38,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "not-analysed-hatch-fill"),
        type: "fill",
        source: meta.sourceId,
        paint: {
          "fill-pattern": "not-analysed-hatch",
          "fill-opacity": 0.42,
        },
      },
      meta
    )
  );

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerIdV4(meta, "not-analysed-outline"),
        type: "line",
        source: meta.sourceId,
        paint: {
          "line-color": "rgba(220, 228, 240, 0.55)",
          "line-width": 1,
          "line-dasharray": [2, 2],
        },
      },
      meta
    )
  );
}

function addGroundMovementStyleLayers(meta) {
  GROUND_MOVEMENT_CLASSES.forEach((item) => {
    addOrReplaceDataLayer(
      withOptionalSourceLayer(
        {
          id: productLayerIdV4(meta, `ground-movement-${item.id}-fill`),
          type: "fill",
          source: meta.sourceId,
          filter: groundMovementClassFilter(item),
          paint: {
            "fill-color": item.color,
            "fill-opacity": 0.72,
          },
        },
        meta
      )
    );

    addOrReplaceDataLayer(
      withOptionalSourceLayer(
        {
          id: productLayerIdV4(meta, `ground-movement-${item.id}-outline`),
          type: "line",
          source: meta.sourceId,
          filter: groundMovementClassFilter(item),
          paint: {
            "line-color": item.color,
            "line-opacity": 0.42,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.15,
              12,
              0.35,
              16,
              0.8,
            ],
          },
        },
        meta
      )
    );
  });
}

function orderedDamageClassesV4(classes) {
  const order = ["destroyed", "damaged", "possible"];

  if (!Array.isArray(classes)) {
    return order;
  }

  return order.filter((item) => classes.includes(item));
}

function getDamageClassesForLegendV4(kind, productKey) {
  const meta = getLoadedSourceMetaV4(kind, productKey);

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.damageClasses)) {
    return orderedDamageClassesV4(meta.damageClasses);
  }

  return ["destroyed", "damaged", "possible"];
}

function getTransportClassesForLegendV4(productKey) {
  const meta = getLoadedSourceMetaV4("transportationL", productKey);
  const order = ["highway", "main", "local", "track", "airfieldRunway", "railway"];

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.transportClasses)) {
    return order.filter((item) => meta.transportClasses.includes(item));
  }

  return order;
}

function getTransportAreaClassesForLegendV4(productKey) {
  const meta = getLoadedSourceMetaV4("transportationA", productKey);

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.transportAreaClasses)) {
    return ["airfieldAndHeliportDamaged"].filter((item) =>
      meta.transportAreaClasses.includes(item)
    );
  }

  return ["airfieldAndHeliportDamaged"];
}

function getCrisisClassesForLegendV4(productKey) {
  const meta = getLoadedSourceMetaV4("ancillaryCrisisInfoP", productKey);

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.crisisClasses)) {
    return ["blockedRoadInterruption"].filter((item) =>
      meta.crisisClasses.includes(item)
    );
  }

  return ["blockedRoadInterruption"];
}

function damageClassLabelV4(className) {
  if (className === "destroyed") return t("destroyed");
  if (className === "damaged") return t("confirmedDamaged");
  if (className === "possible") return t("possiblyDamaged");
  return className;
}

function renderToggleRowV4({ key, swatchHtml, label, checked = true, extraClass = "" }) {
  const isChecked = getLayerVisibility(key, checked);

  return `
    <label class="map-legend-row legend-toggle ${escapeHtml(extraClass)}">
      <input class="layer-checkbox" type="checkbox" data-layer-toggle="${escapeHtml(key)}" ${isChecked ? "checked" : ""} />
      ${swatchHtml}
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderLegendSectionV4(title, rowsHtml) {
  const rows = Array.isArray(rowsHtml) ? rowsHtml.filter(Boolean).join("") : String(rowsHtml || "");

  if (!rows.trim()) {
    return "";
  }

  return `
    <div class="legend-section">
      <div class="legend-section-title">${escapeHtml(title)}</div>
      ${rows}
    </div>
  `;
}

function renderDamageLegendSectionV4(productKey, kind, title, geometry = "area") {
  const classes = getDamageClassesForLegendV4(kind, productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) => {
    const key = visibilityKeyV4(productKey, kind, className);
    const swatchClass = geometry === "point"
      ? `point-swatch ${className}`
      : `swatch ${className}`;

    return renderToggleRowV4({
      key,
      swatchHtml: `<span class="${escapeHtml(swatchClass)}"></span>`,
      label: damageClassLabelV4(className),
      checked: true,
    });
  });

  return renderLegendSectionV4(title, rows);
}

function renderTransportLegendSectionV4(productKey) {
  const classes = getTransportClassesForLegendV4(productKey);

  if (!classes.length) {
    return "";
  }

  const labels = {
    highway: t("highwayNoVisibleDamage"),
    main: t("mainRoadNoVisibleDamage"),
    local: t("localRoadNoVisibleDamage"),
    track: t("trackNoVisibleDamage"),
    airfieldRunway: t("airfieldRunwayNoVisibleDamage"),
    railway: t("railwayNoVisibleDamage"),
  };

  const swatches = {
    highway: "highway",
    main: "main-road",
    local: "local-road",
    track: "track",
    airfieldRunway: "runway",
    railway: "railway",
  };

  const rows = classes.map((className) =>
    renderToggleRowV4({
      key: visibilityKeyV4(productKey, "transportationL", className),
      swatchHtml: `<span class="line-swatch ${escapeHtml(swatches[className] || "local-road")}"></span>`,
      label: labels[className] || className,
      checked: true,
      extraClass: "transport-toggle",
    })
  );

  return renderLegendSectionV4(t("transportationGrading"), rows);
}

function renderTransportationAreaLegendSectionV4(productKey) {
  const classes = getTransportAreaClassesForLegendV4(productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) =>
    renderToggleRowV4({
      key: visibilityKeyV4(productKey, "transportationA", className),
      swatchHtml: '<span class="area-swatch transport-area-damaged"></span>',
      label: t("airfieldAndHeliportDamaged"),
      checked: true,
    })
  );

  return renderLegendSectionV4(t("transportationArea"), rows);
}

function renderCrisisLegendSectionV4(productKey) {
  const classes = getCrisisClassesForLegendV4(productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) =>
    renderToggleRowV4({
      key: visibilityKeyV4(productKey, "ancillaryCrisisInfoP", className),
      swatchHtml: '<span class="crisis-swatch"></span>',
      label: t("blockedRoadInterruption"),
      checked: true,
    })
  );

  return renderLegendSectionV4(t("crisisPoints"), rows);
}

function renderFacilitiesLegendSectionV4(productKey) {
  const classes = getDamageClassesForLegendV4("facilitiesA", productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) => {
    const swatch =
      className === "possible"
        ? '<span class="area-swatch facility-possible"></span>'
        : '<span class="area-swatch facility-damaged"></span>';

    return renderToggleRowV4({
      key: visibilityKeyV4(productKey, "facilitiesA", className),
      swatchHtml: swatch,
      label: damageClassLabelV4(className),
      checked: true,
    });
  });

  return renderLegendSectionV4(t("facilitiesArea"), rows);
}

function renderNotAnalysedLegendSectionV4(productKey) {
  if (!getLoadedSourceMetaV4("notAnalysedA", productKey)) {
    return "";
  }

  return renderLegendSectionV4(
    t("notAnalysed"),
    renderToggleRowV4({
      key: visibilityKeyV4(productKey, "notAnalysedA", "default"),
      swatchHtml: '<span class="swatch hatch"></span>',
      label: t("notAnalysed"),
      checked: false,
    })
  );
}

function renderGroundMovementLegendSectionV4(productKey) {
  if (!getLoadedSourceMetaV4("groundMovementA", productKey)) {
    return "";
  }

  const rows = [
    `<div class="legend-subtitle">${escapeHtml(t("groundMovementM"))}</div>`,
    ...GROUND_MOVEMENT_CLASSES.map((item) =>
      renderToggleRowV4({
        key: visibilityKeyV4(productKey, "groundMovementA", item.key),
        swatchHtml: `<span class="ground-swatch gm-${escapeHtml(item.id)}"></span>`,
        label: item.value,
        checked: true,
      })
    ),
  ];

  return renderLegendSectionV4(t("groundMovementGrading"), rows);
}

function renderSourceImageryLegendSectionV4(info, productKey = "") {
  const cogs = (Array.isArray(info?.cogLayers) ? info.cogLayers : [])
    .filter((item) => !productKey || String(item.productKey) === String(productKey));

  if (!cogs.length) {
    return "";
  }

  const rows = cogs
    .map((item) => {
      return `
        <div class="map-legend-row">
          <span class="image-swatch"></span>
          <a class="image-legend-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>
        </div>
      `;
    })
    .join("");

  return renderLegendSectionV4(t("sourceImagery"), rows);
}

function renderBasemapLabelsLegendSectionV4() {
  const disabled = currentBasemap !== "satellite";
  const checked = satelliteLabelsEnabled && !disabled;

  return renderLegendSectionV4(
    t("basemapTitle"),
    `
      <label class="map-legend-row legend-toggle ${disabled ? "disabled" : ""}">
        <input
          class="layer-checkbox"
          type="checkbox"
          data-basemap-labels-toggle="labels"
          ${checked ? "checked" : ""}
          ${disabled ? "disabled" : ""}
        />
        <span class="image-swatch"></span>
        <span>${escapeHtml(t("satelliteLabels"))}</span>
      </label>
    `
  );
}

function renderAoiLegendSectionV4() {
  return renderLegendSectionV4(
    t("generalInformation"),
    renderToggleRowV4({
      key: "aoi:default",
      swatchHtml: '<span class="aoi-swatch"></span>',
      label: t("areaOfInterest"),
      checked: true,
    })
  );
}

function renderProductLegendSectionsV4(info, product) {
  const productKey = getProductKey(product);

  return [
    renderCrisisLegendSectionV4(productKey),
    renderDamageLegendSectionV4(productKey, "builtUpP", t("builtUpPoints"), "point"),
    renderDamageLegendSectionV4(productKey, "builtUpA", t("builtUpArea"), "area"),
    renderTransportLegendSectionV4(productKey),
    renderNotAnalysedLegendSectionV4(productKey),
    renderFacilitiesLegendSectionV4(productKey),
    renderTransportationAreaLegendSectionV4(productKey),
    renderGroundMovementLegendSectionV4(productKey),
    renderSourceImageryLegendSectionV4(info, productKey),
  ].filter(Boolean);
}

function renderDynamicLegend(info = latestSelectedProductInfo) {
  const body = document.querySelector("#map-legend .map-legend-body");

  if (!body) {
    return;
  }

  const products = Array.isArray(info?.products) && info.products.length
    ? info.products
    : info?.product
      ? [info.product]
      : [];

  const multiple = products.length > 1;
  const sections = [];

  products.forEach((product) => {
    const productSections = renderProductLegendSectionsV4(info, product);

    if (!productSections.length) {
      return;
    }

    if (multiple) {
      sections.push(`
        <div class="legend-product-group">
          <div class="legend-product-title">${escapeHtml(getProductLabel(product))}</div>
          ${productSections.join("")}
        </div>
      `);
    } else {
      sections.push(...productSections);
    }
  });

  sections.push(renderBasemapLabelsLegendSectionV4());
  sections.push(renderAoiLegendSectionV4());

  const cleanSections = sections.filter(Boolean);

  if (!cleanSections.length) {
    body.innerHTML = `<div class="map-legend-placeholder">${escapeHtml(t("noDisplayableLayers"))}</div>`;
  } else {
    body.innerHTML = cleanSections.join("");
  }

  syncLayerToggleInputs();
}

function updateLegendAvailability() {
  syncLayerToggleInputs();
}

function applyLayerVisibility() {
  syncLayerToggleInputs();

  if (!mapReady || !map) {
    return;
  }

  getLoadedSourceMetasV4("builtUpA").forEach((meta) => {
    ["built-up-fill", "built-up-outline"].forEach((baseId) => {
      const layerId = productLayerIdV4(meta, baseId);
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, buildDamageLayerFilterForMetaV4(meta));
      }
    });
  });

  getLoadedSourceMetasV4("builtUpP").forEach((meta) => {
    ["built-up-point-halo", "built-up-point-circle"].forEach((baseId) => {
      const layerId = productLayerIdV4(meta, baseId);
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, buildDamageLayerFilterForMetaV4(meta));
      }
    });
  });

  getLoadedSourceMetasV4("facilitiesA").forEach((meta) => {
    ["facilities-area-fill", "facilities-area-outline"].forEach((baseId) => {
      const layerId = productLayerIdV4(meta, baseId);
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, buildDamageLayerFilterForMetaV4(meta));
      }
    });
  });

  getLoadedSourceMetasV4("transportationA").forEach((meta) => {
    ["transportation-area-fill", "transportation-area-outline"].forEach((baseId) => {
      const layerId = productLayerIdV4(meta, baseId);
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, transportationAreaFilterExpressionV4(meta));
      }
    });
  });

  getLoadedSourceMetasV4("ancillaryCrisisInfoP").forEach((meta) => {
    ["crisis-point-halo", "crisis-point-circle"].forEach((baseId) => {
      const layerId = productLayerIdV4(meta, baseId);
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, ancillaryCrisisInfoFilterExpressionV4(meta));
      }
    });
  });

  getLoadedSourceMetasV4("transportationL").forEach((meta) => {
    const productKey = meta.productKey || "default";

    const configs = [
      ["transportation-highway-line", "highway"],
      ["transportation-main-road-line", "main"],
      ["transportation-local-road-line", "local"],
      ["transportation-track-line", "track"],
      ["transportation-airfield-runway-line", "airfieldRunway"],
      ["transportation-railway-line", "railway"],
      ["transportation-railway-ticks", "railway"],
    ];

    configs.forEach(([baseId, className]) => {
      setLayerVisibility(
        productLayerIdV4(meta, baseId),
        getLayerVisibility(visibilityKeyV4(productKey, "transportationL", className), true)
      );
    });
  });

  getLoadedSourceMetasV4("groundMovementA").forEach((meta) => {
    const productKey = meta.productKey || "default";

    GROUND_MOVEMENT_CLASSES.forEach((item) => {
      const visible = getLayerVisibility(
        visibilityKeyV4(productKey, "groundMovementA", item.key),
        true
      );

      setLayerVisibility(productLayerIdV4(meta, `ground-movement-${item.id}-fill`), visible);
      setLayerVisibility(productLayerIdV4(meta, `ground-movement-${item.id}-outline`), visible);
    });
  });

  getLoadedSourceMetasV4("notAnalysedA").forEach((meta) => {
    const productKey = meta.productKey || "default";
    const showNotAnalysed = getLayerVisibility(
      visibilityKeyV4(productKey, "notAnalysedA", "default"),
      false
    );

    setLayerVisibility(productLayerIdV4(meta, "not-analysed-fill"), showNotAnalysed);
    setLayerVisibility(productLayerIdV4(meta, "not-analysed-hatch-fill"), showNotAnalysed);
    setLayerVisibility(productLayerIdV4(meta, "not-analysed-outline"), showNotAnalysed);
  });

  const showAoi = getLayerVisibility("aoi:default", true);

  AOI_LAYER_IDS.forEach((layerId) => {
    setLayerVisibility(layerId, showAoi);
  });

  syncLayerToggleInputs();
}

function getStatusProgressNodesV4() {
  return {
    progress: document.getElementById("status-progress"),
    bar: document.getElementById("status-progress-bar"),
  };
}

function hideStatusProgressV4() {
  const { progress, bar } = getStatusProgressNodesV4();
  if (!progress || !bar) return;

  progress.classList.add("hidden");
  progress.classList.remove("determinate");
  progress.removeAttribute("aria-valuenow");
  bar.style.width = "";
}

function showStatusProgressV4(percent = null) {
  const { progress, bar } = getStatusProgressNodesV4();
  if (!progress || !bar) return;

  progress.classList.remove("hidden");

  if (typeof percent === "number" && Number.isFinite(percent)) {
    const clamped = Math.max(0, Math.min(100, percent));
    progress.classList.add("determinate");
    progress.setAttribute("aria-valuenow", String(Math.round(clamped)));
    bar.style.width = `${clamped}%`;
  } else {
    progress.classList.remove("determinate");
    progress.removeAttribute("aria-valuenow");
    bar.style.width = "";
  }
}

function setStatus(type, title, message, showRetry) {
  if (!els.status || !els.statusTitle || !els.statusMessage || !els.retry) {
    return;
  }

  els.status.classList.remove("hidden", "loading", "success", "error");
  els.status.classList.add(type);

  els.statusTitle.textContent = title;
  els.statusMessage.textContent = message;
  els.retry.classList.toggle("hidden", !showRetry);

  hideStatusProgressV4();
}

function maybeShowLargeLayerDownloadNotice(kind, url) {
  if (!isPotentiallyLargeCopernicusLayer(kind, url)) {
    return;
  }

  if (isJsonDocumentMemoryCached(url)) {
    return;
  }

  if (!els.status || !els.statusTitle || !els.statusMessage) {
    return;
  }

  setStatus(
    "loading",
    t("largeLayerLoadingTitle"),
    t("largeLayerLoadingText"),
    false
  );

  showStatusProgressV4(null);
}
/* Inline product selector and product comparison override: end */

/* Product checkbox selector and data status grid correction: start */

function parseSelectedProductKeysV5(products = []) {
  const list = Array.isArray(products) ? products : [];
  const useful = list.filter(productHasUsefulLayers);
  const raw = String(selectedProductKey || "").trim();

  // Compatibility with old URLs produced by the previous "All products" button.
  if (raw === PRODUCT_ALL_KEY_V4 || raw.toLowerCase() === "all") {
    return useful.map(getProductKey);
  }

  if (!raw) {
    const fallback = chooseAoiProduct({ products: list }) || list[0] || null;
    return fallback ? [getProductKey(fallback)] : [];
  }

  const wanted = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const valid = wanted.filter((key) =>
    list.some((product) => getProductKey(product) === key)
  );

  if (valid.length) {
    return valid;
  }

  const fallback = chooseAoiProduct({ products: list }) || list[0] || null;
  return fallback ? [getProductKey(fallback)] : [];
}

function selectedProductKeyStringV5(keys = []) {
  return Array.from(new Set(keys.map((key) => String(key || "").trim()).filter(Boolean))).join(",");
}

function isAllProductsSelectedV4() {
  // Keep the function for compatibility, but the UI no longer exposes a forced "all" mode.
  return false;
}

function getSelectedProductsForAoiV4(aoi, products = getProductsSortedForAoi(aoi)) {
  const list = Array.isArray(products) ? products : [];
  const selectedKeys = new Set(parseSelectedProductKeysV5(list));

  return list.filter((product) => selectedKeys.has(getProductKey(product)));
}

function chooseSelectedProductForAoi(aoi, products = getProductsSortedForAoi(aoi)) {
  const selected = getSelectedProductsForAoiV4(aoi, products);

  if (selected.length) {
    return selected[0];
  }

  return products[0] || null;
}

function renderInlineProductOptionsV4(aoi) {
  const products = getProductsSortedForAoi(aoi);

  if (products.length <= 1) {
    return "";
  }

  const selectedKeys = new Set(parseSelectedProductKeysV5(products));

  const productRows = products.map((product) => {
    const productKey = getProductKey(product);
    const available = productHasUsefulLayers(product);
    const checked = selectedKeys.has(productKey);
    const statusLine = formatProductStatusLineV4(product);

    return `
      <label class="aoi-product-check-row ${checked ? "active-product-check" : ""} ${available ? "" : "disabled-product-check"}">
        <input
          class="aoi-product-checkbox"
          type="checkbox"
          data-product-key="${escapeHtml(productKey)}"
          ${checked ? "checked" : ""}
          ${available ? "" : "disabled"}
        />
        <span class="aoi-product-check-text">
          <strong>${escapeHtml(getProductLabel(product))}</strong>
          <small>${escapeHtml(statusLine)}</small>
        </span>
      </label>
    `;
  }).join("");

  return `
    <div class="aoi-product-options checkbox-product-options" aria-label="Product selector">
      ${productRows}
    </div>
  `;
}

function setupUiEvents() {
  const oldCaracasButton = document.getElementById("load-caracas");

  if (oldCaracasButton) {
    oldCaracasButton.addEventListener("click", () => {
      selectedAoiNumber = 2;
      selectedProductKey = "";
      updateAoiUrlParam(2);
      clearSelectedProductUrlParam();
      closeMobileSidebar();
      loadAoi(2);
    });
  }

  if (els.aoiList) {
    els.aoiList.addEventListener("change", (event) => {
      const input = event.target.closest(".aoi-product-checkbox[data-product-key]");

      if (!input) {
        return;
      }

      const options = input.closest(".aoi-product-options");
      if (!options) {
        return;
      }

      const checkedKeys = Array.from(
        options.querySelectorAll(".aoi-product-checkbox[data-product-key]:checked")
      ).map((node) => String(node.dataset.productKey || "").trim()).filter(Boolean);

      // Do not allow an empty product selection; it would look like a data failure.
      if (!checkedKeys.length) {
        input.checked = true;
        return;
      }

      selectedProductKey = selectedProductKeyStringV5(checkedKeys);
      updateSelectedProductUrlParam(selectedProductKey);
      loadAoi(selectedAoiNumber);
    });

    els.aoiList.addEventListener("click", (event) => {
      // Product checkboxes are handled by the change listener above.
      if (event.target.closest(".aoi-product-options")) {
        return;
      }

      const button = event.target.closest("[data-aoi-number]");
      if (!button) return;

      const aoiNumber = Number(button.dataset.aoiNumber);

      if (!Number.isFinite(aoiNumber)) {
        return;
      }

      selectedAoiNumber = aoiNumber;
      selectedProductKey = "";
      updateAoiUrlParam(aoiNumber);
      clearSelectedProductUrlParam();
      closeMobileSidebar();
      loadAoi(aoiNumber);
    });
  }

  const sidebarToggle = document.getElementById("sidebar-toggle");
  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-open");
    });
  }

  if (els.retry) {
    els.retry.addEventListener("click", () => {
      loadAoi(selectedAoiNumber);
    });
  }

  const refreshDataButton = document.getElementById("refresh-data-btn");
  if (refreshDataButton) {
    refreshDataButton.addEventListener("click", forceRefreshCopernicusData);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileSidebar();
    }
  });
}

function renderDataStatusPanel() {
  if (!els.dataProduct) {
    return;
  }

  const meta = latestDataStatusMeta || {};

  const aoiText = meta.aoiName
    ? `${meta.aoiName} AOI${String(meta.aoiNumber ?? "").padStart(2, "0")}`
    : "AOI";

  const productParts = [aoiText];

  if (meta.productSummary) {
    productParts.push(meta.productSummary);
  } else if (meta.productType) {
    productParts.push(meta.productType);
  }

  // Keep this line readable. Product id/status are useful in console/API, but too noisy here.
  setNodeText(els.dataProduct, productParts.join(" · "));
  setNodeText(els.dataDelivery, formatDateTime(meta.deliveryTime || meta.expectedDelivery));
  setNodeText(els.dataAcquisition, formatDateTime(meta.acquisitionTime));
  setNodeText(els.dataLastChecked, formatDateTime(meta.lastChecked));
  setNodeText(els.dataSuccessfulLoad, formatDateTime(meta.successfulLoadTime));
  setNodeText(els.dataCacheStatus, formatCacheStatus(meta));

  if (els.dataReportLink && meta.reportLink) {
    els.dataReportLink.href = meta.reportLink;
    els.dataReportLink.classList.remove("hidden");
  }

  if (els.dataDownloadLink) {
    const downloadUrl = meta.downloadPath || meta.productsPath || "";

    if (downloadUrl) {
      els.dataDownloadLink.href = downloadUrl;
      els.dataDownloadLink.classList.remove("hidden");
      els.dataDownloadLink.textContent = "ZIP";
    } else {
      els.dataDownloadLink.classList.add("hidden");
    }
  }

  renderFreshnessBadge(meta);
}

function setBasemap(mode) {
  currentBasemap = mode === "street" ? "street" : "satellite";

  document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.classList.toggle("active", button.dataset.basemap === currentBasemap);
  });

  if (els.labelsToggle) {
    els.labelsToggle.disabled = currentBasemap !== "satellite";
  }

  if (!mapReady) {
    applyLayerVisibility();
    return;
  }

  setLayerVisibility(BASE_LAYER_IDS.satellite, currentBasemap === "satellite");
  setLayerVisibility(BASE_LAYER_IDS.street, currentBasemap === "street");

  const showLabels = currentBasemap === "satellite" && satelliteLabelsEnabled;
  setLayerVisibility(BASE_LAYER_IDS.labels, showLabels);

  moveLabelsToTop();
  applyLayerVisibility();

  // Refresh the legend so the street-label checkbox is enabled/disabled correctly.
  if (latestSelectedProductInfo && typeof renderDynamicLegend === "function") {
    renderDynamicLegend(latestSelectedProductInfo);
  }
}

/* Product checkbox selector and data status grid correction: end */

/* Real streamed download progress override: start */

function formatBytesForProgressV6(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value < 0) {
    return "—";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function getStatusProgressNodesV4() {
  return {
    progress: document.getElementById("status-progress"),
    bar: document.getElementById("status-progress-bar"),
    label: document.getElementById("status-progress-label"),
  };
}

function hideStatusProgressV4() {
  const { progress, bar, label } = getStatusProgressNodesV4();

  if (progress) {
    progress.classList.add("hidden");
    progress.classList.remove("determinate", "unknown");
    progress.setAttribute("aria-hidden", "true");
    progress.removeAttribute("role");
    progress.removeAttribute("aria-valuemin");
    progress.removeAttribute("aria-valuemax");
    progress.removeAttribute("aria-valuenow");
    progress.removeAttribute("aria-label");
  }

  if (bar) {
    bar.style.width = "";
  }

  if (label) {
    label.classList.add("hidden");
    label.setAttribute("aria-hidden", "true");
    label.textContent = "";
  }
}

function showStatusProgressV4(percent = null, labelText = "") {
  const { progress, bar, label } = getStatusProgressNodesV4();

  if (!progress || !bar) {
    return;
  }

  progress.classList.remove("hidden");
  progress.setAttribute("aria-hidden", "false");

  const hasPercent = typeof percent === "number" && Number.isFinite(percent);

  if (hasPercent) {
    const clamped = Math.max(0, Math.min(100, percent));

    progress.classList.add("determinate");
    progress.classList.remove("unknown");
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    progress.setAttribute("aria-valuenow", String(Math.round(clamped)));
    progress.setAttribute("aria-label", "Download progress");
    bar.style.width = `${clamped}%`;

    if (label) {
      label.textContent = labelText || `${Math.round(clamped)}%`;
      label.classList.remove("hidden");
      label.setAttribute("aria-hidden", "false");
    }

    return;
  }

  // Unknown total size: do not show a fake moving percentage/progress bar.
  progress.classList.remove("determinate");
  progress.classList.add("unknown");
  progress.setAttribute("role", "status");
  progress.removeAttribute("aria-valuemin");
  progress.removeAttribute("aria-valuemax");
  progress.removeAttribute("aria-valuenow");
  progress.setAttribute("aria-label", "Downloading");
  bar.style.width = "0%";

  if (label) {
    label.textContent = labelText || "";
    label.classList.toggle("hidden", !label.textContent);
    label.setAttribute("aria-hidden", label.textContent ? "false" : "true");
  }
}

function shouldReportDownloadProgressV6(requestUrl, label, options = {}) {
  if (options.reportProgress === false) {
    return false;
  }

  if (options.reportProgress === true) {
    return true;
  }

  const text = `${label || ""} ${requestUrl || ""}`.toLowerCase();

  // Currently most important for AOI00 ground movement, but this also works for
  // future large Copernicus layers.
  return (
    text.includes("groundmovement") ||
    text.includes("ground_movement") ||
    text.includes("ground-movement") ||
    text.includes("grm_product")
  );
}

async function readResponseTextWithProgressV6(response, label, requestUrl, options = {}) {
  const totalHeader = response.headers.get("content-length");
  const totalBytes = Number(totalHeader);
  const hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;

  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();

    if (hasTotal) {
      showStatusProgressV4(
        100,
        `100% · ${formatBytesForProgressV6(totalBytes)} / ${formatBytesForProgressV6(totalBytes)}`
      );
    }

    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let receivedBytes = 0;
  let lastUiUpdate = 0;

  if (hasTotal) {
    showStatusProgressV4(
      0,
      `0% · 0 B / ${formatBytesForProgressV6(totalBytes)}`
    );
  } else {
    showStatusProgressV4(
      null,
      `0 B`
    );
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      receivedBytes += value.byteLength || value.length || 0;
    }

    const now = performance.now();

    if (now - lastUiUpdate >= 120) {
      lastUiUpdate = now;

      if (hasTotal) {
        const percent = Math.max(0, Math.min(100, (receivedBytes / totalBytes) * 100));
        showStatusProgressV4(
          percent,
          `${Math.round(percent)}% · ${formatBytesForProgressV6(receivedBytes)} / ${formatBytesForProgressV6(totalBytes)}`
        );
      } else {
        showStatusProgressV4(
          null,
          `${formatBytesForProgressV6(receivedBytes)}`
        );
      }
    }
  }

  if (hasTotal) {
    showStatusProgressV4(
      100,
      `100% · ${formatBytesForProgressV6(receivedBytes)} / ${formatBytesForProgressV6(totalBytes)}`
    );
  } else {
    showStatusProgressV4(
      null,
      `${formatBytesForProgressV6(receivedBytes)}`
    );
  }

  return await new Blob(chunks, {
    type: response.headers.get("content-type") || "application/json",
  }).text();
}

async function fetchJsonDocument(url, label, options = {}) {
  const requestUrl = String(url || "").trim();

  if (!requestUrl) {
    throw new Error(`${label} URL is empty.`);
  }

  const cacheDocument = Boolean(options.cacheDocument);
  const cacheKey = requestUrl;

  if (cacheDocument && JSON_DOCUMENT_MEMORY_CACHE.has(cacheKey)) {
    console.info(`${label}: using in-memory cached JSON document.`);
    return JSON_DOCUMENT_MEMORY_CACHE.get(cacheKey);
  }

  const task = (async () => {
    const response = await fetch(requestUrl, {
      method: "GET",
      mode: "cors",

      // Manifest fetches should stay fresh.
      // Layer JSON files are versioned URLs, so browser cache is safe.
      cache: options.fetchCache || (cacheDocument ? "force-cache" : "no-store"),

      headers: {
        Accept: "application/json, application/geo+json, application/tilejson, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`${label} HTTP ${response.status}: ${requestUrl}`);
    }

    const reportProgress = shouldReportDownloadProgressV6(requestUrl, label, options);

    const text = reportProgress
      ? await readResponseTextWithProgressV6(response, label, requestUrl, options)
      : await response.text();

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error(`${label} was not valid JSON. First 300 chars:`, text.slice(0, 300));
      throw new Error(`${label} is not valid JSON: ${requestUrl}`);
    }
  })();

  if (cacheDocument) {
    JSON_DOCUMENT_MEMORY_CACHE.set(cacheKey, task);

    try {
      return await task;
    } catch (error) {
      if (JSON_DOCUMENT_MEMORY_CACHE.get(cacheKey) === task) {
        JSON_DOCUMENT_MEMORY_CACHE.delete(cacheKey);
      }

      throw error;
    }
  }

  return task;
}

function maybeShowLargeLayerDownloadNotice(kind, url) {
  if (!isPotentiallyLargeCopernicusLayer(kind, url)) {
    return;
  }

  if (isJsonDocumentMemoryCached(url)) {
    return;
  }

  if (!els.status || !els.statusTitle || !els.statusMessage) {
    return;
  }

  setStatus(
    "loading",
    t("largeLayerLoadingTitle"),
    t("largeLayerLoadingText"),
    false
  );

  // Real percentage begins as soon as response Content-Length is available.
  // Before that, show 0% rather than a fake indeterminate animation.
  showStatusProgressV4(0, "0%");
}
/* Real streamed download progress override: end */

/* Basemap controls in map legend override: start */

function renderBasemapControlsLegendSectionV7() {
  const satelliteActive = currentBasemap === "satellite";
  const streetActive = currentBasemap === "street";
  const labelsDisabled = currentBasemap !== "satellite";
  const labelsChecked = satelliteLabelsEnabled && !labelsDisabled;

  return renderLegendSectionV4(
    t("basemapTitle"),
    `
      <div class="legend-basemap-segmented" role="group" aria-label="${escapeHtml(t("basemapTitle"))}">
        <button
          class="legend-basemap-btn ${satelliteActive ? "active" : ""}"
          type="button"
          data-legend-basemap="satellite"
        >${escapeHtml(t("satelliteBasemap"))}</button>

        <button
          class="legend-basemap-btn ${streetActive ? "active" : ""}"
          type="button"
          data-legend-basemap="street"
        >${escapeHtml(t("streetBasemap"))}</button>
      </div>

      <label class="map-legend-row legend-toggle ${labelsDisabled ? "disabled" : ""}">
        <input
          class="layer-checkbox"
          type="checkbox"
          data-basemap-labels-toggle="labels"
          ${labelsChecked ? "checked" : ""}
          ${labelsDisabled ? "disabled" : ""}
        />
        <span class="image-swatch"></span>
        <span>${escapeHtml(t("satelliteLabels"))}</span>
      </label>
    `
  );
}

function renderBasemapLabelsLegendSectionV4() {
  return renderBasemapControlsLegendSectionV7();
}

function setupLayerToggleEvents() {
  const legend = document.getElementById("map-legend");

  if (!legend || legend.dataset.toggleDelegatedV7 === "1") {
    return;
  }

  legend.dataset.toggleDelegatedV7 = "1";

  legend.addEventListener("click", (event) => {
    const basemapButton = event.target.closest("[data-legend-basemap]");

    if (!basemapButton) {
      return;
    }

    const mode = basemapButton.dataset.legendBasemap || "satellite";
    setBasemap(mode);

    if (latestSelectedProductInfo && typeof renderDynamicLegend === "function") {
      renderDynamicLegend(latestSelectedProductInfo);
    }
  });

  legend.addEventListener("change", (event) => {
    const labelsInput = event.target.closest("[data-basemap-labels-toggle]");

    if (labelsInput) {
      satelliteLabelsEnabled = Boolean(labelsInput.checked);

      if (els.labelsToggle) {
        els.labelsToggle.checked = satelliteLabelsEnabled;
      }

      setBasemap(currentBasemap);

      if (latestSelectedProductInfo && typeof renderDynamicLegend === "function") {
        renderDynamicLegend(latestSelectedProductInfo);
      }

      return;
    }

    const input = event.target.closest("[data-layer-toggle]");

    if (!input) {
      return;
    }

    const key = String(input.dataset.layerToggle || "").trim();

    if (!key) {
      return;
    }

    setLayerVisibilityState(key, input.checked);
    syncLayerToggleInputs();
    applyLayerVisibility();
  });

  syncLayerToggleInputs();
}

function renderDynamicLegend(info = latestSelectedProductInfo) {
  const body = document.querySelector("#map-legend .map-legend-body");

  if (!body) {
    return;
  }

  const products = Array.isArray(info?.products) && info.products.length
    ? info.products
    : info?.product
      ? [info.product]
      : [];

  const multiple = products.length > 1;

  // Basemap controls now always appear at the top of the map legend.
  const sections = [
    renderBasemapControlsLegendSectionV7(),
  ];

  products.forEach((product) => {
    const productSections = renderProductLegendSectionsV4(info, product);

    if (!productSections.length) {
      return;
    }

    if (multiple) {
      sections.push(`
        <div class="legend-product-group">
          <div class="legend-product-title">${escapeHtml(getProductLabel(product))}</div>
          ${productSections.join("")}
        </div>
      `);
    } else {
      sections.push(...productSections);
    }
  });

  sections.push(renderAoiLegendSectionV4());

  const cleanSections = sections.filter(Boolean);

  if (!cleanSections.length) {
    body.innerHTML = `<div class="map-legend-placeholder">${escapeHtml(t("noDisplayableLayers"))}</div>`;
  } else {
    body.innerHTML = cleanSections.join("");
  }

  syncLayerToggleInputs();
}

/* Basemap controls in map legend override: end */

/* Client-side COG source imagery rendering: start */

const COG_RENDERER_SCRIPT_URLS_V8 = {
  geotiff: "https://cdn.jsdelivr.net/npm/geotiff@2/dist-browser/geotiff.js",
  proj4: "https://cdn.jsdelivr.net/npm/proj4@2/dist/proj4.js",
};

const COG_SCRIPT_PROMISES_V8 = new Map();
const COG_META_CACHE_V8 = new Map();
const COG_TILE_CACHE_V8 = new Map();
const COG_STATE_V8 = new Map();
const COG_CATALOG_V8 = new Map();

let COG_PROTOCOL_REGISTERED_V8 = false;
let COG_TRANSPARENT_TILE_PROMISE_V8 = null;

function productHasCogLayersV8(product) {
  return Array.isArray(product?.layers) && product.layers.some((layer) => {
    const name = String(layer?.name || "");
    return String(layer?.format || "").toLowerCase() === "cog" || /\.tif(f)?$/i.test(name);
  });
}

function productHasUsefulLayers(product) {
  return productLayerKeys(product).size > 0 || productHasCogLayersV8(product);
}

function productHasVectorLayersV8(product) {
  return productLayerKeys(product).size > 0;
}

function getAoiCardStatusText(product, available) {
  const hasVector = productHasVectorLayersV8(product);
  const hasCog = productHasCogLayersV8(product);

  if (available && hasVector) {
    return t("aoiAvailable");
  }

  if (available && hasCog) {
    return t("sourceImageOnly");
  }

  const status = product?.version?.statusCode || "";
  let base = t("aoiProcessing");

  if (status === "I") {
    base = t("aoiInProgress");
  } else if (status === "W") {
    base = t("aoiPlanned");
  } else if (status === "N") {
    base = t("aoiNotProduced");
  }

  const time =
    product?.expectedDelivery ||
    product?.version?.deliveryTime ||
    getLatestAcquisitionTime(product || {});

  if (time) {
    return `${base} · ${formatDateTime(time)}`;
  }

  return base;
}

function loadScriptOnceV8(url) {
  if (COG_SCRIPT_PROMISES_V8.has(url)) {
    return COG_SCRIPT_PROMISES_V8.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
      } else {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load script: ${url}`));
    document.head.appendChild(script);
  });

  COG_SCRIPT_PROMISES_V8.set(url, promise);
  return promise;
}

async function ensureCogRenderingLibrariesV8() {
  await loadScriptOnceV8(COG_RENDERER_SCRIPT_URLS_V8.geotiff);

  if (!window.GeoTIFF) {
    throw new Error("GeoTIFF library did not expose window.GeoTIFF.");
  }

  await loadScriptOnceV8(COG_RENDERER_SCRIPT_URLS_V8.proj4);

  if (!window.proj4) {
    throw new Error("proj4 library did not expose window.proj4.");
  }
}

function ensureProjDefinitionV8(epsg) {
  const code = Number(epsg);

  if (!Number.isFinite(code)) {
    return;
  }

  const name = `EPSG:${code}`;

  if (code === 4326) {
    window.proj4.defs(name, "+proj=longlat +datum=WGS84 +no_defs +type=crs");
    return;
  }

  if (code === 3857 || code === 900913) {
    window.proj4.defs(name, "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs");
    return;
  }

  if (code >= 32601 && code <= 32660) {
    const zone = code - 32600;
    window.proj4.defs(name, `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs +type=crs`);
    return;
  }

  if (code >= 32701 && code <= 32760) {
    const zone = code - 32700;
    window.proj4.defs(name, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs +type=crs`);
  }
}

function detectCogEpsgV8(image, bbox) {
  let keys = {};

  try {
    keys = image.getGeoKeys() || {};
  } catch {
    keys = {};
  }

  const projected = Number(keys.ProjectedCSTypeGeoKey);
  const geographic = Number(keys.GeographicTypeGeoKey);

  if (Number.isFinite(projected) && projected > 0 && projected !== 32767) {
    return projected;
  }

  if (Number.isFinite(geographic) && geographic > 0 && geographic !== 32767) {
    return geographic;
  }

  const citation = [
    keys.PCSCitationGeoKey,
    keys.GTCitationGeoKey,
    keys.GeogCitationGeoKey,
  ].filter(Boolean).join(" ");

  const epsgMatch = String(citation).match(/EPSG[:\s]*(\d{4,5})/i);
  if (epsgMatch) {
    return Number(epsgMatch[1]);
  }

  const [minX, minY, maxX, maxY] = bbox || [];
  const looksLonLat =
    [minX, maxX].every((value) => Number.isFinite(value) && value >= -180 && value <= 180) &&
    [minY, maxY].every((value) => Number.isFinite(value) && value >= -90 && value <= 90);

  if (looksLonLat) {
    return 4326;
  }

  const looksWebMercator =
    [minX, maxX].some((value) => Math.abs(Number(value)) > 1000000) &&
    [minY, maxY].some((value) => Math.abs(Number(value)) > 1000000);

  if (looksWebMercator) {
    return 3857;
  }

  // EMSR884 Venezuela products are generally WGS84 / UTM 19N if no EPSG is exposed.
  return 32619;
}

function transformImageToLonLatV8(meta, x, y) {
  const epsg = Number(meta.epsg);

  if (epsg === 4326) {
    return [x, y];
  }

  if (!window.proj4) {
    return [NaN, NaN];
  }

  try {
    return window.proj4(`EPSG:${epsg}`, "EPSG:4326", [x, y]);
  } catch {
    return [NaN, NaN];
  }
}

function transformLonLatToImageV8(meta, lon, lat) {
  const epsg = Number(meta.epsg);

  if (epsg === 4326) {
    return [lon, lat];
  }

  if (!window.proj4) {
    return [NaN, NaN];
  }

  try {
    return window.proj4("EPSG:4326", `EPSG:${epsg}`, [lon, lat]);
  } catch {
    return [NaN, NaN];
  }
}

function clampBoundsV8(bounds) {
  const [west, south, east, north] = bounds;

  return [
    Math.max(-180, Math.min(180, west)),
    Math.max(-90, Math.min(90, south)),
    Math.max(-180, Math.min(180, east)),
    Math.max(-90, Math.min(90, north)),
  ];
}

async function getCogMetaV8(url) {
  const requestUrl = String(url || "").trim();

  if (!requestUrl) {
    throw new Error("COG URL is empty.");
  }

  if (COG_META_CACHE_V8.has(requestUrl)) {
    return COG_META_CACHE_V8.get(requestUrl);
  }

  const task = (async () => {
    await ensureCogRenderingLibrariesV8();

    const tiff = await window.GeoTIFF.fromUrl(requestUrl);
    const image = await tiff.getImage();

    const bbox = image.getBoundingBox();
    const epsg = detectCogEpsgV8(image, bbox);

    ensureProjDefinitionV8(4326);
    ensureProjDefinitionV8(3857);
    ensureProjDefinitionV8(epsg);

    const corners = [
      [bbox[0], bbox[1]],
      [bbox[0], bbox[3]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
    ]
      .map(([x, y]) => transformImageToLonLatV8({ epsg }, x, y))
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

    let wgs84Bounds = null;

    if (corners.length) {
      const lons = corners.map((item) => item[0]);
      const lats = corners.map((item) => item[1]);
      wgs84Bounds = clampBoundsV8([
        Math.min(...lons),
        Math.min(...lats),
        Math.max(...lons),
        Math.max(...lats),
      ]);
    }

    const fileDirectory = image.fileDirectory || {};
    const bitsPerSample = Array.isArray(fileDirectory.BitsPerSample)
      ? fileDirectory.BitsPerSample
      : [8];

    const samplesPerPixel =
      typeof image.getSamplesPerPixel === "function"
        ? image.getSamplesPerPixel()
        : Number(fileDirectory.SamplesPerPixel || bitsPerSample.length || 1);

    return {
      url: requestUrl,
      tiff,
      image,
      bbox,
      epsg,
      wgs84Bounds,
      width: image.getWidth(),
      height: image.getHeight(),
      samplesPerPixel,
      bitsPerSample,
      noData: typeof image.getGDALNoData === "function" ? image.getGDALNoData() : null,
    };
  })();

  COG_META_CACHE_V8.set(requestUrl, task);
  return task;
}

function tileXToLonV8(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tileYToLatV8(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

function getTileLonLatBoundsV8(z, x, y) {
  const west = tileXToLonV8(x, z);
  const east = tileXToLonV8(x + 1, z);
  const north = tileYToLatV8(y, z);
  const south = tileYToLatV8(y + 1, z);

  return [west, south, east, north];
}

function boundsIntersectV8(a, b) {
  return !(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3]);
}

async function getTransparentPngTileV8() {
  if (COG_TRANSPARENT_TILE_PROMISE_V8) {
    return COG_TRANSPARENT_TILE_PROMISE_V8;
  }

  COG_TRANSPARENT_TILE_PROMISE_V8 = new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    canvas.toBlob(async (blob) => {
      resolve(await blob.arrayBuffer());
    }, "image/png");
  });

  return COG_TRANSPARENT_TILE_PROMISE_V8;
}

function scaleCogSampleToByteV8(value, bits = 8) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  if (bits <= 8) {
    return Math.max(0, Math.min(255, Math.round(number)));
  }

  if (bits <= 12) {
    return Math.max(0, Math.min(255, Math.round((number / 4095) * 255)));
  }

  if (bits <= 16) {
    return Math.max(0, Math.min(255, Math.round((number / 65535) * 255)));
  }

  return Math.max(0, Math.min(255, Math.round(number)));
}

function buildCogTilePngV8(rasters, meta, tileSize = 256) {
  const sampleCount = Math.min(meta.samplesPerPixel || rasters.length || 1, rasters.length || 1);
  const first = rasters[0];

  if (!first) {
    return getTransparentPngTileV8();
  }

  const canvas = document.createElement("canvas");
  canvas.width = tileSize;
  canvas.height = tileSize;

  const ctx = canvas.getContext("2d");
  const imageData = ctx.createImageData(tileSize, tileSize);
  const data = imageData.data;

  const bits = meta.bitsPerSample || [8];
  const noData = meta.noData;
  const hasNoData = noData !== null && noData !== undefined && String(noData) !== "";

  for (let index = 0; index < tileSize * tileSize; index += 1) {
    let r;
    let g;
    let b;
    let a = 255;

    if (sampleCount >= 3) {
      const rRaw = rasters[0][index];
      const gRaw = rasters[1][index];
      const bRaw = rasters[2][index];

      r = scaleCogSampleToByteV8(rRaw, bits[0] || bits[0] || 8);
      g = scaleCogSampleToByteV8(gRaw, bits[1] || bits[0] || 8);
      b = scaleCogSampleToByteV8(bRaw, bits[2] || bits[0] || 8);

      if (
        hasNoData &&
        String(rRaw) === String(noData) &&
        String(gRaw) === String(noData) &&
        String(bRaw) === String(noData)
      ) {
        a = 0;
      }

      if (sampleCount >= 4 && rasters[3]) {
        a = scaleCogSampleToByteV8(rasters[3][index], bits[3] || 8);
      }
    } else {
      const value = rasters[0][index];
      const gray = scaleCogSampleToByteV8(value, bits[0] || 8);
      r = gray;
      g = gray;
      b = gray;

      if (hasNoData && String(value) === String(noData)) {
        a = 0;
      }
    }

    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Could not encode COG tile as PNG."));
        return;
      }

      resolve(await blob.arrayBuffer());
    }, "image/png");
  });
}

async function renderCogTileV8(url, z, x, y) {
  const tileCacheKey = `${url}|${z}|${x}|${y}`;

  if (COG_TILE_CACHE_V8.has(tileCacheKey)) {
    return COG_TILE_CACHE_V8.get(tileCacheKey);
  }

  const task = (async () => {
    const meta = await getCogMetaV8(url);

    if (!meta.wgs84Bounds) {
      return getTransparentPngTileV8();
    }

    const tileLonLatBounds = getTileLonLatBoundsV8(z, x, y);

    if (!boundsIntersectV8(tileLonLatBounds, meta.wgs84Bounds)) {
      return getTransparentPngTileV8();
    }

    const [west, south, east, north] = tileLonLatBounds;

    const imageCorners = [
      transformLonLatToImageV8(meta, west, south),
      transformLonLatToImageV8(meta, west, north),
      transformLonLatToImageV8(meta, east, south),
      transformLonLatToImageV8(meta, east, north),
    ].filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py));

    if (!imageCorners.length) {
      return getTransparentPngTileV8();
    }

    const xs = imageCorners.map((item) => item[0]);
    const ys = imageCorners.map((item) => item[1]);

    const bbox = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];

    if (!boundsIntersectV8(bbox, meta.bbox)) {
      return getTransparentPngTileV8();
    }

    const samples =
      meta.samplesPerPixel >= 3
        ? meta.samplesPerPixel >= 4
          ? [0, 1, 2, 3]
          : [0, 1, 2]
        : [0];

    let rasters;

    try {
      rasters = await meta.tiff.readRasters({
        bbox,
        width: 256,
        height: 256,
        samples,
        interleave: false,
      });
    } catch (error) {
      console.warn("COG tile read failed, returning transparent tile:", error);
      return getTransparentPngTileV8();
    }

    return buildCogTilePngV8(rasters, meta, 256);
  })();

  COG_TILE_CACHE_V8.set(tileCacheKey, task);

  // Keep memory bounded.
  if (COG_TILE_CACHE_V8.size > 384) {
    const firstKey = COG_TILE_CACHE_V8.keys().next().value;
    COG_TILE_CACHE_V8.delete(firstKey);
  }

  return task;
}

function parseCogProtocolUrlV8(rawUrl) {
  const parsed = new URL(rawUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);

  const z = Number(parts[0]);
  const x = Number(parts[1]);
  const yPart = String(parts[2] || "").replace(/\.(png|jpg|jpeg)$/i, "");
  const y = Number(yPart);
  const url = parsed.searchParams.get("url") || "";

  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y) || !url) {
    throw new Error(`Invalid COG tile URL: ${rawUrl}`);
  }

  return {
    url,
    z,
    x,
    y,
  };
}

async function ensureCogProtocolRegisteredV8() {
  await ensureCogRenderingLibrariesV8();

  if (COG_PROTOCOL_REGISTERED_V8) {
    return;
  }

  if (!window.maplibregl?.addProtocol) {
    throw new Error("MapLibre addProtocol is not available.");
  }

  window.maplibregl.addProtocol("emsrcog", async (params) => {
    const parsed = parseCogProtocolUrlV8(params.url);
    const data = await renderCogTileV8(parsed.url, parsed.z, parsed.x, parsed.y);

    return {
      data,
      cacheControl: "max-age=3600",
    };
  });

  COG_PROTOCOL_REGISTERED_V8 = true;
}

function hashStringV8(value) {
  let hash = 0;
  const text = String(value || "");

  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function cogItemKeyV8(item) {
  return `${safeMapIdV4(item?.productKey || "default")}-${hashStringV8(item?.url || item?.label || "")}`;
}

function getCogLayerStateV8(key) {
  if (!COG_STATE_V8.has(key)) {
    COG_STATE_V8.set(key, {
      visible: false,
      opacity: 0.75,
    });
  }

  return COG_STATE_V8.get(key);
}

function getCogLayerIdsV8(key) {
  const safeKey = safeMapIdV4(key);

  return {
    sourceId: `copernicus-source-image-${safeKey}`,
    layerId: `copernicus-source-image-layer-${safeKey}`,
  };
}

function findFirstOverlayLayerBeforeIdV8() {
  const style = map?.getStyle?.();

  if (!style?.layers) {
    return map?.getLayer?.(BASE_LAYER_IDS.labels) ? BASE_LAYER_IDS.labels : undefined;
  }

  const overlayIds = new Set([
    ...Array.from(DYNAMIC_DATA_LAYER_IDS_V4 || []),
    ...DATA_LAYER_IDS,
  ]);

  for (const layer of style.layers) {
    if (!layer?.id) continue;
    if (String(layer.id).startsWith("copernicus-source-image-layer-")) continue;

    if (overlayIds.has(layer.id)) {
      return layer.id;
    }
  }

  return map?.getLayer?.(BASE_LAYER_IDS.labels) ? BASE_LAYER_IDS.labels : undefined;
}

async function addCogRasterLayerV8(item) {
  if (!mapReady || !map || !item?.url) {
    return;
  }

  const key = cogItemKeyV8(item);
  const state = getCogLayerStateV8(key);
  const ids = getCogLayerIdsV8(key);

  setStatus(
    "loading",
    t("sourceImageryLoadingTitle"),
    `${t("sourceImageryLoadingText")} ${item.label || ""}`,
    false
  );

  showStatusProgressV4(null, "");

  try {
    await ensureCogProtocolRegisteredV8();

    const meta = await getCogMetaV8(item.url);

    if (!map.getSource(ids.sourceId)) {
      const tileUrl = `emsrcog://tile/{z}/{x}/{y}.png?url=${encodeURIComponent(item.url)}`;
      const sourceDefinition = {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 22,
        attribution: "Copernicus EMS Rapid Mapping",
      };

      if (Array.isArray(meta.wgs84Bounds) && meta.wgs84Bounds.length === 4) {
        sourceDefinition.bounds = meta.wgs84Bounds;
      }

      map.addSource(ids.sourceId, sourceDefinition);
      DYNAMIC_SOURCE_IDS_V4.add(ids.sourceId);
    }

    if (!map.getLayer(ids.layerId)) {
      map.addLayer(
        {
          id: ids.layerId,
          type: "raster",
          source: ids.sourceId,
          paint: {
            "raster-opacity": state.opacity,
            "raster-fade-duration": 120,
          },
        },
        findFirstOverlayLayerBeforeIdV8()
      );

      DYNAMIC_DATA_LAYER_IDS_V4.add(ids.layerId);
    }

    setLayerVisibility(ids.layerId, true);
    map.setPaintProperty(ids.layerId, "raster-opacity", state.opacity);
    moveLabelsToTop();

    map.once("idle", () => {
      if (getCogLayerStateV8(key).visible && map.getLayer(ids.layerId)) {
        setStatus(
          "success",
          t("sourceImageryLoadedTitle"),
          `${item.label || ""} — ${t("sourceImageryLoadedText")}`,
          false
        );

        window.setTimeout(() => {
          if (els.status?.classList.contains("success")) {
            els.status.classList.add("hidden");
          }
        }, 3500);
      }
    });
  } catch (error) {
    console.error("COG source image load failed:", error);

    state.visible = false;

    setStatus(
      "error",
      t("sourceImageryErrorTitle"),
      `${t("sourceImageryErrorText")}${error.message ? ` (${error.message})` : ""}`,
      false
    );

    renderDynamicLegend(latestSelectedProductInfo);
  }
}

function removeCogRasterLayerV8(itemOrKey) {
  const key = typeof itemOrKey === "string" ? itemOrKey : cogItemKeyV8(itemOrKey);
  const ids = getCogLayerIdsV8(key);

  if (map?.getLayer?.(ids.layerId)) {
    map.removeLayer(ids.layerId);
  }

  if (map?.getSource?.(ids.sourceId)) {
    map.removeSource(ids.sourceId);
  }

  DYNAMIC_DATA_LAYER_IDS_V4.delete(ids.layerId);
  DYNAMIC_SOURCE_IDS_V4.delete(ids.sourceId);
}

function setCogOpacityV8(key, opacity) {
  const state = getCogLayerStateV8(key);
  state.opacity = Math.max(0, Math.min(1, Number(opacity) || 0));

  const ids = getCogLayerIdsV8(key);

  if (map?.getLayer?.(ids.layerId)) {
    map.setPaintProperty(ids.layerId, "raster-opacity", state.opacity);
  }

  const valueNode = document.querySelector(`[data-cog-opacity-value="${CSS.escape(key)}"]`);
  if (valueNode) {
    valueNode.textContent = `${Math.round(state.opacity * 100)}%`;
  }
}

async function syncActiveCogLayersForCurrentInfoV8(info = latestSelectedProductInfo) {
  const activeKeys = new Set();

  (Array.isArray(info?.cogLayers) ? info.cogLayers : []).forEach((item) => {
    const key = cogItemKeyV8(item);
    COG_CATALOG_V8.set(key, item);

    if (getCogLayerStateV8(key).visible) {
      activeKeys.add(key);
      addCogRasterLayerV8(item);
    }
  });

  // Remove COG map layers whose products/images are no longer selected.
  for (const [key, state] of COG_STATE_V8.entries()) {
    if (state.visible && !activeKeys.has(key)) {
      const ids = getCogLayerIdsV8(key);

      if (map?.getLayer?.(ids.layerId) || map?.getSource?.(ids.sourceId)) {
        removeCogRasterLayerV8(key);
      }
    }
  }
}

function renderSourceImageryLegendSectionV4(info, productKey = "") {
  const cogs = (Array.isArray(info?.cogLayers) ? info.cogLayers : [])
    .filter((item) => !productKey || String(item.productKey) === String(productKey));

  if (!cogs.length) {
    return "";
  }

  const rows = cogs
    .map((item) => {
      const key = cogItemKeyV8(item);
      COG_CATALOG_V8.set(key, item);

      const state = getCogLayerStateV8(key);
      const opacityPercent = Math.round(state.opacity * 100);

      return `
        <div class="cog-legend-item">
          <label class="map-legend-row legend-toggle cog-toggle-row">
            <input
              class="layer-checkbox"
              type="checkbox"
              data-cog-toggle="${escapeHtml(key)}"
              ${state.visible ? "checked" : ""}
            />
            <span class="image-swatch"></span>
            <span>
              ${escapeHtml(item.label)}
              <a
                class="image-legend-link cog-file-link"
                href="${escapeHtml(item.url)}"
                target="_blank"
                rel="noopener noreferrer"
                title="Open TIFF"
              >TIFF</a>
            </span>
          </label>

          <label class="cog-opacity-row ${state.visible ? "" : "hidden"}">
            <span>Opacity</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value="${opacityPercent}"
              data-cog-opacity="${escapeHtml(key)}"
            />
            <strong data-cog-opacity-value="${escapeHtml(key)}">${opacityPercent}%</strong>
          </label>
        </div>
      `;
    })
    .join("");

  return renderLegendSectionV4(t("sourceImagery"), rows);
}

function setupLayerToggleEvents() {
  const legend = document.getElementById("map-legend");

  if (!legend || legend.dataset.toggleDelegatedV8 === "1") {
    return;
  }

  legend.dataset.toggleDelegatedV8 = "1";

  legend.addEventListener("click", (event) => {
    const basemapButton = event.target.closest("[data-legend-basemap]");

    if (!basemapButton) {
      return;
    }

    const mode = basemapButton.dataset.legendBasemap || "satellite";
    setBasemap(mode);

    if (latestSelectedProductInfo && typeof renderDynamicLegend === "function") {
      renderDynamicLegend(latestSelectedProductInfo);
    }
  });

  legend.addEventListener("input", (event) => {
    const opacityInput = event.target.closest("[data-cog-opacity]");

    if (!opacityInput) {
      return;
    }

    const key = String(opacityInput.dataset.cogOpacity || "").trim();
    const opacity = Number(opacityInput.value) / 100;

    setCogOpacityV8(key, opacity);
  });

  legend.addEventListener("change", async (event) => {
    const cogInput = event.target.closest("[data-cog-toggle]");

    if (cogInput) {
      const key = String(cogInput.dataset.cogToggle || "").trim();
      const item = COG_CATALOG_V8.get(key);
      const state = getCogLayerStateV8(key);

      state.visible = Boolean(cogInput.checked);

      renderDynamicLegend(latestSelectedProductInfo);

      if (state.visible && item) {
        await addCogRasterLayerV8(item);
      } else {
        removeCogRasterLayerV8(key);
      }

      return;
    }

    const labelsInput = event.target.closest("[data-basemap-labels-toggle]");

    if (labelsInput) {
      satelliteLabelsEnabled = Boolean(labelsInput.checked);

      if (els.labelsToggle) {
        els.labelsToggle.checked = satelliteLabelsEnabled;
      }

      setBasemap(currentBasemap);

      if (latestSelectedProductInfo && typeof renderDynamicLegend === "function") {
        renderDynamicLegend(latestSelectedProductInfo);
      }

      return;
    }

    const input = event.target.closest("[data-layer-toggle]");

    if (!input) {
      return;
    }

    const key = String(input.dataset.layerToggle || "").trim();

    if (!key) {
      return;
    }

    setLayerVisibilityState(key, input.checked);
    syncLayerToggleInputs();
    applyLayerVisibility();
  });

  syncLayerToggleInputs();
}

function renderDynamicLegend(info = latestSelectedProductInfo) {
  const body = document.querySelector("#map-legend .map-legend-body");

  if (!body) {
    return;
  }

  const products = Array.isArray(info?.products) && info.products.length
    ? info.products
    : info?.product
      ? [info.product]
      : [];

  const multiple = products.length > 1;

  const sections = [
    renderBasemapControlsLegendSectionV7(),
  ];

  products.forEach((product) => {
    const productSections = renderProductLegendSectionsV4(info, product);

    if (!productSections.length) {
      return;
    }

    if (multiple) {
      sections.push(`
        <div class="legend-product-group">
          <div class="legend-product-title">${escapeHtml(getProductLabel(product))}</div>
          ${productSections.join("")}
        </div>
      `);
    } else {
      sections.push(...productSections);
    }
  });

  sections.push(renderAoiLegendSectionV4());

  const cleanSections = sections.filter(Boolean);

  if (!cleanSections.length) {
    body.innerHTML = `<div class="map-legend-placeholder">${escapeHtml(t("noDisplayableLayers"))}</div>`;
  } else {
    body.innerHTML = cleanSections.join("");
  }

  syncLayerToggleInputs();

  // Re-add visible COG layers after AOI/product reloads.
  window.setTimeout(() => {
    syncActiveCogLayersForCurrentInfoV8(info);
  }, 0);
}

async function loadAoi(aoiNumber = selectedAoiNumber) {
  if (!mapReady || isLoading) return;

  const nextAoiNumber = Number(aoiNumber);
  selectedAoiNumber = Number.isFinite(nextAoiNumber)
    ? nextAoiNumber
    : DEFAULT_AOI_NUMBER;

  isLoading = true;

  latestDataStatusMeta = {};
  latestSelectedProductInfo = null;
  renderDataStatusPanel();

  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  try {
    clearCopernicusDataLayers();

    const info = await getCopernicusLayerInfo(selectedAoiNumber);
    latestSelectedProductInfo = info;

    renderAoiList(latestAois);
    fitAoiExtent(info.aoi);
    showAoiExtent(info.aoi);

    const wantedOrder = [
      "notAnalysedA",
      "groundMovementA",
      "transportationA",
      "facilitiesA",
      "builtUpA",
      "builtUpP",
      "ancillaryCrisisInfoP",
      "transportationL",
    ];

    const layerJobs = [];

    for (const entry of info.productLayerEntries || []) {
      for (const kind of wantedOrder) {
        const url = entry.urls?.[kind];

        if (url) {
          layerJobs.push([kind, url, entry.product]);
        }
      }
    }

    const results = [];

    for (const [kind, url, product] of layerJobs) {
      try {
        const value = await addCopernicusLayer(kind, url, product);
        results.push({ status: "fulfilled", value, kind, product });
      } catch (error) {
        console.warn(`Layer ${kind} failed:`, error);
        results.push({ status: "rejected", reason: error, kind, product });
      }
    }

    const loadedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value === true
    ).length;

    showAoiExtent(info.aoi);
    moveLabelsToTop();
    renderDynamicLegend(info);
    applyLayerVisibility();

    const hasSourceImages = Array.isArray(info.cogLayers) && info.cogLayers.length > 0;

    if (loadedCount === 0 && !hasSourceImages) {
      console.warn("Copernicus layer load results:", results);

      setStatus(
        "error",
        t("aoiUnavailableTitle"),
        `${formatAoiLabel(info.aoi)} · ${formatProductListLabel(info.products || []) || getProductLabel(info.product)} — ${t("aoiUnavailableText")}`,
        false
      );

      updateDataStatusPanel({
        successfulLoadTime: "",
        loadedLayerCount: 0,
      });

      return;
    }

    updateDataStatusPanel({
      successfulLoadTime: new Date().toISOString(),
      loadedLayerCount: loadedCount,
    });

    renderAoiList(latestAois);

    const statusMessage = loadedCount > 0
      ? t("loadedText")
      : `${t("sourceImageOnly")} — ${t("loadedText")}`;

    setStatus(
      "success",
      t("loadedTitle"),
      `${formatAoiLabel(info.aoi)} · ${formatProductListLabel(info.products || []) || getProductLabel(info.product)} — ${statusMessage}`,
      false
    );

    window.setTimeout(() => {
      if (els.status.classList.contains("success")) {
        els.status.classList.add("hidden");
      }
    }, 5500);
  } catch (error) {
    console.error(error);

    setStatus(
      "error",
      t("unavailableTitle"),
      `${t("unavailableText")}${error.message ? ` (${error.message})` : ""}`,
      true
    );
  } finally {
    isLoading = false;
  }
}

/* Client-side COG source imagery rendering: end */

/* Official product status display override: start */

function getOfficialProductStatusCodeV9(product) {
  return String(product?.version?.statusCode || "").toUpperCase();
}

function getOfficialProductDotClassV9(product) {
  const status = getOfficialProductStatusCodeV9(product);

  if (status === "F") {
    return "green";
  }

  if (status === "N") {
    return "red";
  }

  if (status === "W" || status === "I") {
    return "amber";
  }

  // Defensive fallback: if Copernicus gives a layer but no status code, show amber
  // unless it has real vector layers and no known negative status.
  if (productHasVectorLayersV8(product)) {
    return "green";
  }

  return "amber";
}

function getOfficialProductBaseStatusTextV9(product) {
  const status = getOfficialProductStatusCodeV9(product);
  const hasVector = productHasVectorLayersV8(product);

  if (status === "F") {
    return hasVector ? t("aoiAvailable") : t("sourceImageOnly");
  }

  if (status === "N") {
    return t("aoiNotProduced");
  }

  if (status === "W") {
    return t("aoiPlanned");
  }

  if (status === "I") {
    return t("aoiInProgress");
  }

  if (hasVector) {
    return t("aoiAvailable");
  }

  return t("aoiProcessing");
}

function getAoiCardStatusText(product, available) {
  if (!product) {
    return t("aoiProcessing");
  }

  const status = getOfficialProductStatusCodeV9(product);
  const hasVector = productHasVectorLayersV8(product);
  const hasCog = productHasCogLayersV8(product);

  const parts = [
    getOfficialProductBaseStatusTextV9(product),
  ];

  // Important: a source image can exist even when Copernicus says "Not produced".
  // In that case, keep the official red/not-produced status, but explain that
  // the source image can still be viewed.
  if (hasCog && !hasVector && status !== "F") {
    parts.push(t("sourceImageOnly"));
  }

  const time =
    product?.expectedDelivery ||
    product?.version?.deliveryTime ||
    getLatestAcquisitionTime(product || {});

  if (time) {
    parts.push(formatDateTime(time));
  }

  return parts.filter(Boolean).join(" · ");
}

function formatProductStatusLineV4(product) {
  return getAoiCardStatusText(product, productHasUsefulLayers(product));
}

function renderAoiList(aois = latestAois) {
  if (!els.aoiList || !Array.isArray(aois) || !aois.length) {
    return;
  }

  els.aoiList.innerHTML = aois
    .map((aoi) => {
      const product = chooseAoiProduct(aoi);
      const selectable = productHasUsefulLayers(product);
      const selected = Number(aoi.number) === Number(selectedAoiNumber);

      const numberText = String(aoi.number).padStart(2, "0");
      const name = aoi.name || `AOI${numberText}`;

      // The dot follows official Copernicus product status, not just whether
      // a COG source image exists.
      const dotClass = getOfficialProductDotClassV9(product);

      const classes = [
        "aoi-card",
        selectable ? "available-aoi" : "disabled placeholder-aoi",
        selected ? "active-aoi" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const productLabel = getProductLabel(product);
      const statusText = getAoiCardStatusText(product, selectable);

      return `
        <div class="aoi-entry ${selected ? "selected-aoi-entry" : ""}">
          <button
            class="${classes}"
            type="button"
            data-aoi-number="${Number(aoi.number)}"
            aria-disabled="${selectable ? "false" : "true"}"
            title="${escapeHtml(statusText)}"
          >
            <span class="status-dot ${dotClass}" aria-hidden="true"></span>
            <span>
              <strong>${escapeHtml(numberText)} ${escapeHtml(name)}</strong>
              <small>${escapeHtml(productLabel)} · ${escapeHtml(statusText)}</small>
            </span>
          </button>
          ${selected ? renderInlineProductOptionsV4(aoi) : ""}
        </div>
      `;
    })
    .join("");
}

/* Official product status display override: end */

/* Product checkbox official status color override: start */

function getProductCheckStatusClassV10(product) {
  const dot = getOfficialProductDotClassV9(product);

  if (dot === "green") return "status-green-product-check";
  if (dot === "red") return "status-red-product-check";
  if (dot === "amber") return "status-amber-product-check";

  return "status-neutral-product-check";
}

function renderInlineProductOptionsV4(aoi) {
  const products = getProductsSortedForAoi(aoi);

  if (products.length <= 1) {
    return "";
  }

  const selectedKeys = new Set(parseSelectedProductKeysV5(products));

  const productRows = products.map((product) => {
    const productKey = getProductKey(product);
    const available = productHasUsefulLayers(product);
    const checked = selectedKeys.has(productKey);
    const statusLine = formatProductStatusLineV4(product);
    const statusClass = getProductCheckStatusClassV10(product);

    return `
      <label class="aoi-product-check-row ${checked ? "active-product-check" : ""} ${statusClass} ${available ? "" : "disabled-product-check"}">
        <input
          class="aoi-product-checkbox"
          type="checkbox"
          data-product-key="${escapeHtml(productKey)}"
          ${checked ? "checked" : ""}
          ${available ? "" : "disabled"}
        />
        <span class="aoi-product-check-text">
          <strong>${escapeHtml(getProductLabel(product))}</strong>
          <small>${escapeHtml(statusLine)}</small>
        </span>
      </label>
    `;
  }).join("");

  return `
    <div class="aoi-product-options checkbox-product-options" aria-label="Product selector">
      ${productRows}
    </div>
  `;
}

/* Product checkbox official status color override: end */
