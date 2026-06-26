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
const COPERNICUS_MANIFEST_CACHE_KEY = "emsr884-manifest-cache-v1";

const COPERNICUS_FORCE_REFRESH = (() => {
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("refresh") ||
    params.has("forceRefresh") ||
    params.has("nocache")
  );
})();

const CARACAS = {
  id: "AOI02",
  name: "Caracas",
  center: [-66.9036, 10.4806],
  zoom: 11.2,
  pitch: 0,
  bearing: 0,
};

/**
 * Manual emergency fallback.
 * These may be GeoJSON URLs OR TileJSON URLs.
 */
const COPERNICUS_URL_OVERRIDES = {
  builtUpA: "",
  transportationL: "",
  notAnalysedA: "",
};

const SOURCE_IDS = {
  builtUpA: "copernicus-built-up-a",
  transportationL: "copernicus-transportation-l",
  notAnalysedA: "copernicus-not-analysed-a",
};

const BASE_LAYER_IDS = {
  satellite: "basemap-satellite",
  street: "basemap-street",
  labels: "basemap-labels",
};

const translations = {
  es: {
    eyebrow: "Panel satelital público",
    title: "Mapa del terremoto en Venezuela 2026",
    subtitle: "Visor no oficial de datos públicos Copernicus EMSR884.",
    mobileTitle: "Mapa del terremoto en Venezuela 2026",

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
    footerCredit: "Construido por YIN Renlong como interfaz pública no oficial. No recopila datos de rescate, víctimas ni personas desaparecidas. Si encuentra un problema,",
    footerGithubLink: "visite el proyecto en GitHub",
    footerPeriod: ".",
    loadingTitle: "Cargando datos satelitales",
    loadingText: "Obteniendo capas públicas de Copernicus EMSR884.",
    loadedTitle: "Datos satelitales cargados",
    loadedText: "Capas públicas de Caracas cargadas correctamente.",
    unavailableTitle: "Datos satelitales temporalmente no disponibles",
    unavailableText:
      "No se pudieron cargar las capas públicas de Copernicus. Puede ser un problema temporal, CORS o un cambio en el manifiesto de datos.",
    retry: "Reintentar",
  },

  en: {
    eyebrow: "Public satellite dashboard",
    title: "Venezuela earthquake map 2026",
    subtitle: "Unofficial viewer for Copernicus EMSR884 public data.",
    mobileTitle: "Venezuela earthquake map 2026",

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
    footerCredit: "Built by YIN Renlong as an unofficial public-interest interface. No rescue, casualty, or missing-person data is collected. If you find an issue,",
    footerGithubLink: "visit the GitHub project",
    footerPeriod: ".",
    loadingTitle: "Loading satellite data",
    loadingText: "Fetching Copernicus EMSR884 public layers.",
    loadedTitle: "Satellite data loaded",
    loadedText: "Public Caracas layers loaded successfully.",
    unavailableTitle: "Satellite data temporarily unavailable",
    unavailableText:
      "The public Copernicus layers could not be loaded. This may be temporary, caused by CORS, or caused by a change in the data manifest.",
    retry: "Retry",
  },

  it: {
    eyebrow: "Dashboard satellitare pubblico",
    title: "Mappa del terremoto in Venezuela 2026",
    subtitle: "Visore non ufficiale dei dati pubblici Copernicus EMSR884.",
    mobileTitle: "Mappa del terremoto in Venezuela 2026",

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
    footerCredit: "Realizzato da YIN Renlong come interfaccia pubblica non ufficiale. Non vengono raccolti dati su soccorsi, vittime o persone scomparse. Se trovi un problema,",
    footerGithubLink: "visita il progetto su GitHub",
    footerPeriod: ".",
    loadingTitle: "Caricamento dati satellitari",
    loadingText: "Recupero dei layer pubblici Copernicus EMSR884.",
    loadedTitle: "Dati satellitari caricati",
    loadedText: "Layer pubblici di Caracas caricati correttamente.",
    unavailableTitle: "Dati satellitari temporaneamente non disponibili",
    unavailableText:
      "Non è stato possibile caricare i layer pubblici Copernicus. Potrebbe essere un problema temporaneo, CORS o una modifica del manifesto dati.",
    retry: "Riprova",
  },

  zh: {
    eyebrow: "公共卫星仪表板",
    title: "2026 委内瑞拉地震地图",
    subtitle: "Copernicus EMSR884 公共数据的非官方查看器。",
    mobileTitle: "2026 委内瑞拉地震地图",

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
    footerCredit: "由 YIN Renlong 构建，作为非官方公益界面。不收集救援、伤亡或失踪人员数据。如发现问题，请",
    footerGithubLink: "访问 GitHub 项目",
    footerPeriod: "。",
    loadingTitle: "正在加载卫星数据",
    loadingText: "正在获取 Copernicus EMSR884 公共图层。",
    loadedTitle: "卫星数据已加载",
    loadedText: "Caracas 公共图层已成功加载。",
    unavailableTitle: "卫星数据暂时不可用",
    unavailableText:
      "无法加载 Copernicus 公共图层。可能是临时问题、CORS 限制或数据清单结构发生变化。",
    retry: "重试",
  },
};

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
  notAnalysed: true,
};

const loadedSourceMeta = {};
let latestDataStatusMeta = {};
const els = {};

document.addEventListener("DOMContentLoaded", () => {
  els.status = document.getElementById("map-status");
  els.statusTitle = document.getElementById("status-title");
  els.statusMessage = document.getElementById("status-message");
  els.retry = document.getElementById("retry-btn");
  els.labelsToggle = document.getElementById("satellite-labels-toggle");

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
    await loadCaracas();
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
  document.getElementById("load-caracas").addEventListener("click", () => {
    closeMobileSidebar();
    loadCaracas();
  });

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });

  els.retry.addEventListener("click", () => {
    loadCaracas();
  });

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
  document.querySelectorAll("[data-layer-toggle]").forEach((input) => {
    const key = input.dataset.layerToggle;

    if (!(key in layerVisibility)) {
      return;
    }

    input.checked = Boolean(layerVisibility[key]);
    input.closest(".legend-toggle")?.classList.toggle("off", !input.checked);

    input.addEventListener("change", () => {
      layerVisibility[key] = input.checked;
      input.closest(".legend-toggle")?.classList.toggle("off", !input.checked);
      applyLayerVisibility();
    });
  });
}


function closeMobileSidebar() {
  document.body.classList.remove("sidebar-open");
}

function applyLanguage(lang) {
  const dictionary = translations[lang] || translations.es;

  document.documentElement.lang = lang === "zh" ? "zh" : lang;

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (dictionary[key]) {
      node.textContent = dictionary[key];
    }
  });

  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });

  renderDataStatusPanel();
}

function t(key) {
  return (translations[currentLang] || translations.es)[key] || key;
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
  if (!mapReady || isLoading) return;

  isLoading = true;
  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  map.flyTo({
    center: CARACAS.center,
    zoom: CARACAS.zoom,
    pitch: CARACAS.pitch,
    bearing: CARACAS.bearing,
    duration: 1200,
    essential: true,
  });

  try {
    const urls = await getCopernicusLayerUrls();

    const jobs = [
      urls.notAnalysedA
        ? addCopernicusLayer("notAnalysedA", urls.notAnalysedA)
        : Promise.resolve(false),

      urls.builtUpA
        ? addCopernicusLayer("builtUpA", urls.builtUpA)
        : Promise.resolve(false),

      urls.transportationL
        ? addCopernicusLayer("transportationL", urls.transportationL)
        : Promise.resolve(false),
    ];

    const results = await Promise.allSettled(jobs);

    const loadedCount = results.filter(
      (result) => result.status === "fulfilled" && result.value === true
    ).length;

    if (loadedCount === 0) {
      console.warn("Copernicus layer load results:", results);
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(`Layer promise ${index} rejected:`, result.reason);
        }
      });

      throw new Error("No usable Copernicus layer loaded.");
    }

    moveLabelsToTop();

    updateDataStatusPanel({
      successfulLoadTime: new Date().toISOString(),
      loadedLayerCount: loadedCount,
    });

    setStatus("success", t("loadedTitle"), t("loadedText"), false);

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
      `${t("unavailableText")} ${error.message ? `(${error.message})` : ""}`,
      true
    );
  } finally {
    isLoading = false;
  }
}

async function getCopernicusLayerUrls() {
  const overrides = cleanOverrideUrls(COPERNICUS_URL_OVERRIDES);

  if (Object.keys(overrides).length === 3) {
    return overrides;
  }

  const manifestInfo = await getCachedCopernicusManifest();
  const manifest = manifestInfo.manifest;

  const caracasAoi = findCaracasAoi(manifest);
  if (!caracasAoi) {
    throw new Error("Caracas AOI02 not found in EMSR884 manifest.");
  }

  const product = chooseCaracasProduct(caracasAoi);
  if (!product) {
    throw new Error("No usable Caracas GRA product found in EMSR884 manifest.");
  }

  updateDataStatusPanel({
    activationCode: "EMSR884",
    aoiName: caracasAoi.name || "Caracas",
    aoiNumber: caracasAoi.number,
    productId: product.id,
    productType: product.type,
    productStatus: product.version?.statusCode || "",
    deliveryTime: product.version?.deliveryTime || "",
    expectedDelivery: product.expectedDelivery || "",
    acquisitionTime: getLatestAcquisitionTime(product),
    lastChecked: manifestInfo.checkedAt,
    fromCache: manifestInfo.fromCache,
    cacheStale: manifestInfo.stale,
    cacheAgeMs: manifestInfo.cacheAgeMs,
    reportLink: manifest?.results?.[0]?.reportLink || "",
    productsPath: manifest?.results?.[0]?.productsPath || "",
    downloadPath: product.downloadPath || "",
  });

  const structuredUrls = extractLayerUrlsFromProduct(product);
  const fallbackUrls = pickLayerUrls(collectUrlRecords(manifest));

  const urls = {
    ...fallbackUrls,
    ...structuredUrls,
    ...overrides,
  };

  console.info("Selected Copernicus layer URLs:", {
    aoiName: caracasAoi.name,
    aoiNumber: caracasAoi.number,
    productId: product.id,
    productType: product.type,
    productStatus: product.version?.statusCode,
    urls,
  });

  if (!urls.builtUpA && !urls.transportationL && !urls.notAnalysedA) {
    throw new Error("No Caracas AOI02 builtUpA / transportationL / notAnalysedA URLs found.");
  }

  return urls;
}

function findCaracasAoi(manifest) {
  const aois = [];

  for (const result of manifest?.results || []) {
    if (Array.isArray(result.aois)) {
      aois.push(...result.aois);
    }
  }

  return (
    aois.find((aoi) => Number(aoi.number) === 2) ||
    aois.find((aoi) => String(aoi.name || "").toLowerCase() === "caracas") ||
    aois.find((aoi) => String(aoi.name || "").toLowerCase().includes("caracas"))
  );
}

function chooseCaracasProduct(aoi) {
  const products = Array.isArray(aoi.products) ? aoi.products : [];

  const hasUsefulLayers = (product) =>
    Array.isArray(product.layers) &&
    product.layers.some((layer) => {
      const jsonUrl = String(layer.json || "").trim();
      const name = String(layer.name || "");
      return jsonUrl.startsWith("http") && classifyLayer(`${name} ${jsonUrl}`);
    });

  return (
    products.find(
      (product) =>
        product.type === "GRA" &&
        product.version?.statusCode === "F" &&
        hasUsefulLayers(product)
    ) ||
    products.find((product) => product.type === "GRA" && hasUsefulLayers(product)) ||
    products.find(hasUsefulLayers) ||
    null
  );
}

function extractLayerUrlsFromProduct(product) {
  const urls = {};

  for (const layer of product.layers || []) {
    const jsonUrl = String(layer.json || "").trim();

    if (!jsonUrl.startsWith("http")) {
      continue;
    }

    const key = classifyLayer(`${layer.name || ""} ${jsonUrl}`);

    if (key) {
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
  const meta = await ensureCopernicusSource(kind, url);

  if (kind === "builtUpA") {
    addBuiltUpStyleLayers(meta);
  } else if (kind === "transportationL") {
    addTransportationStyleLayer(meta);
  } else if (kind === "notAnalysedA") {
    addNotAnalysedStyleLayers(meta);
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

  const json = await fetchJsonDocument(url, `${kind} Copernicus JSON`);

  console.info(`Fetched ${kind} JSON summary:`, summarizeJson(json, url));

  if (isGeoJson(json)) {
    const geojson = normalizeGeoJson(json);

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
    : "Caracas AOI02";

  const productParts = [aoiText];

  if (meta.productType) productParts.push(meta.productType);
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


async function fetchJsonDocument(url, label) {
  const response = await fetch(url, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    headers: {
      Accept: "application/json, application/geo+json, application/tilejson, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}: ${url}`);
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(`${label} was not valid JSON. First 300 chars:`, text.slice(0, 300));
    throw new Error(`${label} is not valid JSON: ${url}`);
  }
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

function addBuiltUpStyleLayers(meta) {
  const color = damageColorExpression();

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "built-up-fill",
        type: "fill",
        source: SOURCE_IDS.builtUpA,
        filter: damageFilterExpression(),
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
        filter: damageFilterExpression(),
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

function addTransportationStyleLayer(meta) {
  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: "transportation-lines",
        type: "line",
        source: SOURCE_IDS.transportationL,
        paint: {
          "line-color": "rgba(245, 248, 255, 0.92)",
          "line-opacity": 0.62,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9,
            0.5,
            12,
            1.0,
            15,
            2.0,
          ],
        },
      },
      meta
    )
  );
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

  if (text.includes(".tif") || text.includes(".zip") || text.includes(".sld")) {
    return false;
  }

  return (
    text.endsWith(".json") ||
    text.includes("builtupa") ||
    text.includes("built_up_a") ||
    text.includes("built-up-a") ||
    text.includes("transportationl") ||
    text.includes("transportation_l") ||
    text.includes("transportation-l") ||
    text.includes("notanalyseda") ||
    text.includes("not_analysed_a") ||
    text.includes("not-analysed-a")
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
    transportationL: findBestLayerUrl(candidates, records, "transportationL"),
    notAnalysedA: findBestLayerUrl(candidates, records, "notAnalysedA"),
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

function isCaracasRecord(text) {
  const lower = text.toLowerCase();

  return (
    lower.includes("caracas") ||
    /\baoi\s*0?2\b/.test(lower) ||
    /aoi[_-]?0?2/.test(lower) ||
    /aois[_-]?0?2/.test(lower) ||
    /emsr884[_-]?0?2/.test(lower) ||
    /[_/-]0?2[_/-]/.test(lower)
  );
}

function classifyLayer(text) {
  const lower = text.toLowerCase();

  if (
    lower.includes("builtupa") ||
    lower.includes("built_up_a") ||
    lower.includes("built-up-a") ||
    lower.includes("built up a")
  ) {
    return "builtUpA";
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
  const notAnalysedAllowed = currentBasemap === "street";
  const notAnalysedInput = document.querySelector('[data-layer-toggle="notAnalysed"]');

  if (notAnalysedInput) {
    const row = notAnalysedInput.closest(".legend-toggle");

    notAnalysedInput.disabled = !notAnalysedAllowed;

    // In satellite mode, show it as unavailable/off.
    // In street-map mode, restore the user's selected state.
    notAnalysedInput.checked = notAnalysedAllowed
      ? Boolean(layerVisibility.notAnalysed)
      : false;

    if (row) {
      row.classList.toggle("disabled", !notAnalysedAllowed);
      row.classList.toggle(
        "off",
        !notAnalysedAllowed || !layerVisibility.notAnalysed
      );

      row.title = notAnalysedAllowed
        ? ""
        : "Disponible solo en el mapa de calles.";
    }
  }

  if (!mapReady || !map) {
    return;
  }

  const damageFilter = buildDamageLayerFilter();

  if (map.getLayer("built-up-fill")) {
    map.setFilter("built-up-fill", damageFilter);
  }

  if (map.getLayer("built-up-outline")) {
    map.setFilter("built-up-outline", damageFilter);
  }

  setLayerVisibility("transportation-lines", layerVisibility.roads);

  const showNotAnalysed = notAnalysedAllowed && layerVisibility.notAnalysed;

  setLayerVisibility("not-analysed-fill", showNotAnalysed);
  setLayerVisibility("not-analysed-hatch-fill", showNotAnalysed);
  setLayerVisibility("not-analysed-outline", showNotAnalysed);
}


function setStatus(type, title, message, showRetry) {
  els.status.classList.remove("hidden", "loading", "success", "error");
  els.status.classList.add(type);

  els.statusTitle.textContent = title;
  els.statusMessage.textContent = message;
  els.retry.classList.toggle("hidden", !showRetry);
}
