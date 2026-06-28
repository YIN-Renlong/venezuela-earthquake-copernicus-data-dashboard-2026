"use strict";

import {
  AOI_LAYER_IDS,
  BASE_LAYER_IDS,
  CARACAS,
  DAMAGE_PROPERTY_FIELDS,
  DATA_LAYER_IDS,
  GROUND_MOVEMENT_CLASSES,
  SOURCE_IDS,
} from "./config.js";

import { state, getLayerVisibility } from "./state.js";

import {
  allPropertiesText,
  getBoundsFromWktPolygon,
  includesAnyText,
  lowerProperty,
  normalizeSummaryText,
  readFirstTextProperty,
  safeMapId,
  wktPolygonToGeoJson,
} from "./utils.js";

import {
  classifyLayer,
  getProductKey,
  getProductLabel,
} from "./copernicus.js";

import { fetchJsonDocument } from "./api.js";

export function initMap(onLoad) {
  state.map = new maplibregl.Map({
    container: "map",
    style: createMapStyle(),
    center: CARACAS.center,
    zoom: CARACAS.zoom,
    pitch: CARACAS.pitch,
    bearing: CARACAS.bearing,
    attributionControl: true,
  });

  state.map.addControl(new maplibregl.NavigationControl(), "top-right");

  state.map.on("load", async () => {
    state.mapReady = true;
    addHatchPattern();
    setBasemap(state.currentBasemap);

    if (typeof onLoad === "function") {
      await onLoad();
    }
  });

  state.map.on("error", (event) => {
    console.warn("MapLibre map error:", event?.error || event);
  });
}

export function createMapStyle() {
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
          "Satellite imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      },

      "osm-streets": {
        type: "raster",
        tiles: [
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

export function setBasemap(mode) {
  state.currentBasemap = mode === "street" ? "street" : "satellite";

  document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.classList.toggle("active", button.dataset.basemap === state.currentBasemap);
  });

  if (state.els.labelsToggle) {
    state.els.labelsToggle.disabled = state.currentBasemap !== "satellite";
  }

  if (!state.mapReady) {
    applyLayerVisibility();
    return;
  }

  setLayerVisibility(BASE_LAYER_IDS.satellite, state.currentBasemap === "satellite");
  setLayerVisibility(BASE_LAYER_IDS.street, state.currentBasemap === "street");

  const showLabels = state.currentBasemap === "satellite" && state.satelliteLabelsEnabled;
  setLayerVisibility(BASE_LAYER_IDS.labels, showLabels);

  moveLabelsToTop();
  applyLayerVisibility();
}

export function setLayerVisibility(layerId, visible) {
  if (!state.map?.getLayer(layerId)) {
    return;
  }

  state.map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

export function moveLabelsToTop() {
  if (!state.mapReady || !state.map?.getLayer(BASE_LAYER_IDS.labels)) {
    return;
  }

  try {
    state.map.moveLayer(BASE_LAYER_IDS.labels);
  } catch {
    // Ignore layer-order errors.
  }
}

export function clearCopernicusDataLayers() {
  if (!state.map) {
    return;
  }

  const layerIds = new Set([
    ...DATA_LAYER_IDS,
    ...state.dynamicDataLayerIds,
  ]);

  for (const layerId of layerIds) {
    if (state.map.getLayer(layerId)) {
      state.map.removeLayer(layerId);
    }
  }

  const sourceIds = new Set([
    ...Object.values(SOURCE_IDS),
    ...state.dynamicSourceIds,
  ]);

  for (const sourceId of sourceIds) {
    if (state.map.getSource(sourceId)) {
      state.map.removeSource(sourceId);
    }

    delete state.loadedSourceMeta[sourceId];
  }

  state.dynamicDataLayerIds.clear();
  state.dynamicSourceIds.clear();
}

export function fitAoiExtent(aoi) {
  if (!state.map || !aoi?.extent) {
    state.map?.flyTo({
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

  state.map.fitBounds(bounds, {
    padding: 80,
    maxZoom: 14,
    duration: 1200,
    essential: true,
  });
}

export function showAoiExtent(aoi) {
  if (!state.mapReady || !state.map || !aoi?.extent) {
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
  const existingSource = state.map.getSource(sourceId);

  if (existingSource && typeof existingSource.setData === "function") {
    existingSource.setData(geojson);
  } else if (!existingSource) {
    state.map.addSource(sourceId, {
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

export async function addCopernicusLayer(kind, url, product = null) {
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
  const sourceId = `${baseSourceId}-${safeMapId(productKey)}`;

  if (state.map.getSource(sourceId) && state.loadedSourceMeta[sourceId]) {
    return state.loadedSourceMeta[sourceId];
  }

  const json = await fetchJsonDocument(url, `${kind} Copernicus JSON`, {
    cacheDocument: true,
    fetchCache: "force-cache",
  });

  console.info(`Fetched ${kind} JSON summary:`, summarizeJson(json, url));

  if (isGeoJson(json)) {
    const geojson = normalizeGeoJson(json);
    const featureSummary = summarizeLayerFeatures(kind, geojson.features || []);

    state.map.addSource(sourceId, {
      type: "geojson",
      data: geojson,
      generateId: true,
    });

    state.dynamicSourceIds.add(sourceId);

    state.loadedSourceMeta[sourceId] = {
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

    return state.loadedSourceMeta[sourceId];
  }

  if (isTileJson(json)) {
    const tiles = Array.isArray(json.tiles)
      ? json.tiles.map((tile) => resolveTileUrl(tile, url))
      : [];

    if (!tiles.length) {
      throw new Error(
        `${kind}: JSON looks like TileJSON but has no tiles[] array. Keys: ${Object.keys(json).join(", ")}`
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

    state.map.addSource(sourceId, sourceDefinition);
    state.dynamicSourceIds.add(sourceId);

    state.loadedSourceMeta[sourceId] = {
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

    return state.loadedSourceMeta[sourceId];
  }

  throw new Error(
    `${kind}: Unsupported Copernicus JSON. It is neither GeoJSON nor TileJSON. Keys: ${Object.keys(json || {}).join(", ")}`
  );
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
      const transportClass = classifyTransportationPropertiesForLegend(feature?.properties || {});

      if (transportClass) {
        transportClasses.add(transportClass);
      }
    });

    summary.transportClasses = Array.from(transportClasses);
  }

  if (kind === "transportationA") {
    const transportAreaClasses = new Set();

    list.forEach((feature) => {
      const className = classifyTransportationAreaPropertiesForLegend(feature?.properties || {});

      if (className) {
        transportAreaClasses.add(className);
      }
    });

    summary.transportAreaClasses = Array.from(transportAreaClasses);
  }

  if (kind === "ancillaryCrisisInfoP") {
    const crisisClasses = new Set();

    list.forEach((feature) => {
      const className = classifyAncillaryCrisisPropertiesForLegend(feature?.properties || {});

      if (className) {
        crisisClasses.add(className);
      }
    });

    summary.crisisClasses = Array.from(crisisClasses);
  }

  return summary;
}

function withOptionalSourceLayer(layerDefinition, meta) {
  if (meta.sourceType === "vector" && meta.sourceLayer) {
    layerDefinition["source-layer"] = meta.sourceLayer;
  }

  return layerDefinition;
}

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

function transportationDamageTextExpression() {
  return damageTextExpression();
}

function transportationNoVisibleDamageExpression() {
  const damage = transportationDamageTextExpression();

  return [
    "any",
    containsTextExpression(damage, "no visible damage"),
    containsTextExpression(damage, "no damage"),
    containsTextExpression(damage, "not damaged"),
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

export function visibilityKey(productKey, kind, className) {
  return `${safeMapId(productKey)}:${kind}:${className}`;
}

export function productLayerId(meta, baseId) {
  return `${baseId}-${safeMapId(meta?.productKey || "default")}`;
}

function buildDamageLayerFilterForMeta(meta) {
  const productKey = meta?.productKey || "default";
  const kind = meta?.kind || "builtUpA";
  const activeFilters = [];

  if (getLayerVisibility(visibilityKey(productKey, kind, "possible"), true)) {
    activeFilters.push(possibleDamageExpression());
  }

  if (getLayerVisibility(visibilityKey(productKey, kind, "damaged"), true)) {
    activeFilters.push(confirmedDamagedExpression());
  }

  if (getLayerVisibility(visibilityKey(productKey, kind, "destroyed"), true)) {
    activeFilters.push(destroyedDamageExpression());
  }

  if (activeFilters.length === 0) {
    return hiddenDamageExpression();
  }

  return ["any", ...activeFilters];
}

function transportationAreaFilterExpression(meta) {
  return getLayerVisibility(
    visibilityKey(meta?.productKey || "default", "transportationA", "airfieldAndHeliportDamaged"),
    true
  )
    ? visibleAllFilterExpression()
    : hiddenDamageExpression();
}

function ancillaryCrisisInfoFilterExpression(meta) {
  return getLayerVisibility(
    visibilityKey(meta?.productKey || "default", "ancillaryCrisisInfoP", "blockedRoadInterruption"),
    true
  )
    ? visibleAllFilterExpression()
    : hiddenDamageExpression();
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

function addBuiltUpStyleLayers(meta) {
  const color = damageColorExpression();

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerId(meta, "built-up-fill"),
        type: "fill",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMeta(meta),
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
        id: productLayerId(meta, "built-up-outline"),
        type: "line",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMeta(meta),
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
        id: productLayerId(meta, "built-up-point-halo"),
        type: "circle",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMeta(meta),
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
        id: productLayerId(meta, "built-up-point-circle"),
        type: "circle",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMeta(meta),
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
        id: productLayerId(meta, "facilities-area-fill"),
        type: "fill",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMeta(meta),
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
        id: productLayerId(meta, "facilities-area-outline"),
        type: "line",
        source: meta.sourceId,
        filter: buildDamageLayerFilterForMeta(meta),
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
        id: productLayerId(meta, "transportation-area-fill"),
        type: "fill",
        source: meta.sourceId,
        filter: transportationAreaFilterExpression(meta),
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
        id: productLayerId(meta, "transportation-area-outline"),
        type: "line",
        source: meta.sourceId,
        filter: transportationAreaFilterExpression(meta),
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
        id: productLayerId(meta, "crisis-point-halo"),
        type: "circle",
        source: meta.sourceId,
        filter: ancillaryCrisisInfoFilterExpression(meta),
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
        id: productLayerId(meta, "crisis-point-circle"),
        type: "circle",
        source: meta.sourceId,
        filter: ancillaryCrisisInfoFilterExpression(meta),
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
          id: productLayerId(meta, layer.baseId),
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
  if (!state.map.hasImage("not-analysed-hatch")) {
    addHatchPattern();
  }

  addOrReplaceDataLayer(
    withOptionalSourceLayer(
      {
        id: productLayerId(meta, "not-analysed-fill"),
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
        id: productLayerId(meta, "not-analysed-hatch-fill"),
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
        id: productLayerId(meta, "not-analysed-outline"),
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
          id: productLayerId(meta, `ground-movement-${item.id}-fill`),
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
          id: productLayerId(meta, `ground-movement-${item.id}-outline`),
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

export function addHatchPattern() {
  if (!state.map || state.map.hasImage("not-analysed-hatch")) {
    return;
  }

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
  state.map.addImage("not-analysed-hatch", imageData, { pixelRatio: 1 });
}

export function addOrReplaceDataLayer(layerDefinition) {
  if (state.map.getLayer(layerDefinition.id)) {
    state.map.removeLayer(layerDefinition.id);
  }

  const beforeId = state.map.getLayer(BASE_LAYER_IDS.labels)
    ? BASE_LAYER_IDS.labels
    : undefined;

  try {
    state.map.addLayer(layerDefinition, beforeId);
    state.dynamicDataLayerIds.add(layerDefinition.id);
  } catch (error) {
    console.error("Failed to add layer:", layerDefinition);
    throw error;
  }
}

export function getLoadedSourceMetas(kind, productKey = "") {
  return Object.values(state.loadedSourceMeta || {}).filter((meta) => {
    if (!meta || meta.kind !== kind) return false;
    if (productKey && String(meta.productKey) !== String(productKey)) return false;
    return true;
  });
}

export function getLoadedSourceMeta(kind, productKey = "") {
  return getLoadedSourceMetas(kind, productKey)[0] || null;
}

export function applyLayerVisibility() {
  if (!state.mapReady || !state.map) {
    return;
  }

  getLoadedSourceMetas("builtUpA").forEach((meta) => {
    ["built-up-fill", "built-up-outline"].forEach((baseId) => {
      const layerId = productLayerId(meta, baseId);

      if (state.map.getLayer(layerId)) {
        state.map.setFilter(layerId, buildDamageLayerFilterForMeta(meta));
      }
    });
  });

  getLoadedSourceMetas("builtUpP").forEach((meta) => {
    ["built-up-point-halo", "built-up-point-circle"].forEach((baseId) => {
      const layerId = productLayerId(meta, baseId);

      if (state.map.getLayer(layerId)) {
        state.map.setFilter(layerId, buildDamageLayerFilterForMeta(meta));
      }
    });
  });

  getLoadedSourceMetas("facilitiesA").forEach((meta) => {
    ["facilities-area-fill", "facilities-area-outline"].forEach((baseId) => {
      const layerId = productLayerId(meta, baseId);

      if (state.map.getLayer(layerId)) {
        state.map.setFilter(layerId, buildDamageLayerFilterForMeta(meta));
      }
    });
  });

  getLoadedSourceMetas("transportationA").forEach((meta) => {
    ["transportation-area-fill", "transportation-area-outline"].forEach((baseId) => {
      const layerId = productLayerId(meta, baseId);

      if (state.map.getLayer(layerId)) {
        state.map.setFilter(layerId, transportationAreaFilterExpression(meta));
      }
    });
  });

  getLoadedSourceMetas("ancillaryCrisisInfoP").forEach((meta) => {
    ["crisis-point-halo", "crisis-point-circle"].forEach((baseId) => {
      const layerId = productLayerId(meta, baseId);

      if (state.map.getLayer(layerId)) {
        state.map.setFilter(layerId, ancillaryCrisisInfoFilterExpression(meta));
      }
    });
  });

  getLoadedSourceMetas("transportationL").forEach((meta) => {
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
        productLayerId(meta, baseId),
        getLayerVisibility(visibilityKey(productKey, "transportationL", className), true)
      );
    });
  });

  getLoadedSourceMetas("groundMovementA").forEach((meta) => {
    const productKey = meta.productKey || "default";

    GROUND_MOVEMENT_CLASSES.forEach((item) => {
      const visible = getLayerVisibility(
        visibilityKey(productKey, "groundMovementA", item.key),
        true
      );

      setLayerVisibility(productLayerId(meta, `ground-movement-${item.id}-fill`), visible);
      setLayerVisibility(productLayerId(meta, `ground-movement-${item.id}-outline`), visible);
    });
  });

  getLoadedSourceMetas("notAnalysedA").forEach((meta) => {
    const productKey = meta.productKey || "default";
    const showNotAnalysed = getLayerVisibility(
      visibilityKey(productKey, "notAnalysedA", "default"),
      false
    );

    setLayerVisibility(productLayerId(meta, "not-analysed-fill"), showNotAnalysed);
    setLayerVisibility(productLayerId(meta, "not-analysed-hatch-fill"), showNotAnalysed);
    setLayerVisibility(productLayerId(meta, "not-analysed-outline"), showNotAnalysed);
  });

  const showAoi = getLayerVisibility("aoi:default", true);

  AOI_LAYER_IDS.forEach((layerId) => {
    setLayerVisibility(layerId, showAoi);
  });
}
