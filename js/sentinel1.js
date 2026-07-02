"use strict";

import {
  AOI_LAYER_IDS,
  BASE_LAYER_IDS,
  DATA_LAYER_IDS,
  PMTILES_SCRIPT_URL,
  SENTINEL1_CONFIG,
} from "./config.js";

import { state } from "./state.js";
import { moveLabelsToTop, setLayerVisibility } from "./map.js";

const SENTINEL_SCRIPT_PROMISES = new Map();
let pmtilesProtocolPromise = null;
let analyzedAreaDataPromise = null;

function loadScriptOnce(url) {
  if (SENTINEL_SCRIPT_PROMISES.has(url)) {
    return SENTINEL_SCRIPT_PROMISES.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((script) => {
      return script.getAttribute("src") === url || script.src === url;
    });

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

  SENTINEL_SCRIPT_PROMISES.set(url, promise);
  return promise;
}

async function ensurePmtilesProtocol() {
  if (pmtilesProtocolPromise) {
    return pmtilesProtocolPromise;
  }

  pmtilesProtocolPromise = (async () => {
    await loadScriptOnce(PMTILES_SCRIPT_URL);

    if (!window.pmtiles?.Protocol) {
      throw new Error("PMTiles library did not expose window.pmtiles.Protocol.");
    }

    if (!window.maplibregl?.addProtocol) {
      throw new Error("MapLibre addProtocol is not available.");
    }

    if (!window.__emsr884PmtilesProtocol) {
      const protocol = new window.pmtiles.Protocol();
      window.__emsr884PmtilesProtocol = protocol;
      window.maplibregl.addProtocol("pmtiles", protocol.tile);
    }
  })();

  return pmtilesProtocolPromise;
}

function resolveLocalAssetUrl(pathOrUrl) {
  const value = String(pathOrUrl || "").trim();

  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return new URL(value, window.location.href).href;
}

async function assertAssetAvailable(url, label) {
  try {
    const head = await fetch(url, {
      method: "HEAD",
      cache: "force-cache",
    });

    if (head.ok) {
      return;
    }
  } catch {
    // Fall back to a small ranged GET below.
  }

  const response = await fetch(url, {
    method: "GET",
    cache: "force-cache",
    headers: {
      Range: "bytes=0-0",
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`${label} HTTP ${response.status}: ${url}`);
  }
}

async function fetchAnalyzedAreaGeoJson() {
  if (analyzedAreaDataPromise) {
    return analyzedAreaDataPromise;
  }

  analyzedAreaDataPromise = (async () => {
    const url = resolveLocalAssetUrl(SENTINEL1_CONFIG.analyzedGeoJsonUrl);

    if (!url) {
      throw new Error("Sentinel-1 analyzed-area GeoJSON URL is empty.");
    }

    const response = await fetch(url, {
      method: "GET",
      cache: "force-cache",
      headers: {
        Accept: "application/geo+json, application/json, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`Sentinel-1 analyzed-area GeoJSON HTTP ${response.status}: ${url}`);
    }

    return response.json();
  })();

  return analyzedAreaDataPromise;
}

function sentinelLayerBeforeId() {
  const style = state.map?.getStyle?.();

  if (!style?.layers) {
    return state.map?.getLayer?.(BASE_LAYER_IDS.labels) ? BASE_LAYER_IDS.labels : undefined;
  }

  const officialOverlayIds = new Set([
    ...DATA_LAYER_IDS,
    ...Array.from(state.dynamicDataLayerIds || []),
    ...AOI_LAYER_IDS,
  ]);

  for (const layer of style.layers) {
    if (!layer?.id) continue;

    if (officialOverlayIds.has(layer.id)) {
      return layer.id;
    }
  }

  return state.map?.getLayer?.(BASE_LAYER_IDS.labels) ? BASE_LAYER_IDS.labels : undefined;
}

function addOrReplaceComparisonLayer(layerDefinition) {
  if (!state.map) {
    return;
  }

  if (state.map.getLayer(layerDefinition.id)) {
    state.map.removeLayer(layerDefinition.id);
  }

  state.map.addLayer(layerDefinition, sentinelLayerBeforeId());
}

function sentinelDamageProbabilityExpression() {
  return [
    "to-number",
    [
      "coalesce",
      ["get", "damage_probability"],
      ["get", "damage_prob"],
      ["get", "probability"],
      ["get", "score"],
      0.5,
    ],
    0.5,
  ];
}

async function ensureAnalyzedAreaLayers() {
  if (!state.mapReady || !state.map) {
    return false;
  }

  const ids = SENTINEL1_CONFIG.layerIds;

  if (
    state.map.getSource(SENTINEL1_CONFIG.analyzedSourceId) &&
    state.map.getLayer(ids.analyzedFill) &&
    state.map.getLayer(ids.analyzedOutline)
  ) {
    state.sentinel1.analyzedLoaded = true;
    return true;
  }

  const geojson = await fetchAnalyzedAreaGeoJson();

  if (!state.map.getSource(SENTINEL1_CONFIG.analyzedSourceId)) {
    state.map.addSource(SENTINEL1_CONFIG.analyzedSourceId, {
      type: "geojson",
      data: geojson,
      attribution: SENTINEL1_CONFIG.attribution,
    });
  }

  addOrReplaceComparisonLayer({
    id: ids.analyzedFill,
    type: "fill",
    source: SENTINEL1_CONFIG.analyzedSourceId,
    paint: {
      "fill-color": "rgba(56, 189, 248, 0.95)",
      "fill-opacity": 0.075,
    },
  });

  addOrReplaceComparisonLayer({
    id: ids.analyzedOutline,
    type: "line",
    source: SENTINEL1_CONFIG.analyzedSourceId,
    paint: {
      "line-color": "rgba(165, 243, 252, 0.98)",
      "line-opacity": 0.92,
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        1.1,
        9,
        1.8,
        13,
        2.8,
      ],
      "line-dasharray": [2, 1.4],
    },
  });

  state.sentinel1.analyzedLoaded = true;
  return true;
}

async function ensureDamagedStructureLayers() {
  if (!state.mapReady || !state.map) {
    return false;
  }

  const ids = SENTINEL1_CONFIG.layerIds;

  if (
    state.map.getSource(SENTINEL1_CONFIG.damagedSourceId) &&
    state.map.getLayer(ids.damagedFill) &&
    state.map.getLayer(ids.damagedOutline)
  ) {
    state.sentinel1.damagedLoaded = true;
    return true;
  }

  await ensurePmtilesProtocol();

  const pmtilesUrl = resolveLocalAssetUrl(SENTINEL1_CONFIG.damagedPmtilesUrl);

  if (!pmtilesUrl) {
    throw new Error("Sentinel-1 damaged-structures PMTiles URL is empty.");
  }

  await assertAssetAvailable(pmtilesUrl, "Sentinel-1 damaged-structures PMTiles");

  if (!state.map.getSource(SENTINEL1_CONFIG.damagedSourceId)) {
    state.map.addSource(SENTINEL1_CONFIG.damagedSourceId, {
      type: "vector",
      url: `pmtiles://${pmtilesUrl}`,
      attribution: SENTINEL1_CONFIG.attribution,
    });
  }

  addOrReplaceComparisonLayer({
    id: ids.damagedFill,
    type: "fill",
    source: SENTINEL1_CONFIG.damagedSourceId,
    "source-layer": SENTINEL1_CONFIG.damagedSourceLayer,
    minzoom: 10,
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        sentinelDamageProbabilityExpression(),
        0.5,
        "#ffb3d9",
        0.65,
        "#ff6aa2",
        0.8,
        "#e11d5f",
        1.0,
        "#6b0035",
      ],
      "fill-opacity": state.sentinel1?.opacity ?? 0.72,
    },
  });

  addOrReplaceComparisonLayer({
    id: ids.damagedOutline,
    type: "line",
    source: SENTINEL1_CONFIG.damagedSourceId,
    "source-layer": SENTINEL1_CONFIG.damagedSourceLayer,
    minzoom: 12,
    paint: {
      "line-color": "rgba(80, 0, 45, 0.95)",
      "line-opacity": Math.min(0.95, (state.sentinel1?.opacity ?? 0.72) + 0.12),
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        12,
        0.25,
        15,
        0.65,
        18,
        1.1,
      ],
    },
  });

  state.sentinel1.damagedLoaded = true;
  return true;
}

export async function ensureSentinel1ComparisonLayers() {
  if (!state.mapReady || !state.map) {
    return false;
  }

  if (state.sentinel1?.analyzedVisible) {
    await ensureAnalyzedAreaLayers();
  }

  if (state.sentinel1?.damagedVisible) {
    await ensureDamagedStructureLayers();
  }

  state.sentinel1.loaded = Boolean(
    state.sentinel1?.analyzedLoaded || state.sentinel1?.damagedLoaded
  );

  updateSentinel1LayerVisibility();
  moveLabelsToTop();

  return true;
}

export function updateSentinel1LayerVisibility() {
  if (!state.mapReady || !state.map) {
    return;
  }

  const ids = SENTINEL1_CONFIG.layerIds;
  const sentinelState = state.sentinel1 || {};
  const analyzedVisible = Boolean(sentinelState.analyzedVisible);
  const damagedVisible = Boolean(sentinelState.damagedVisible);
  const opacity = Math.max(0, Math.min(1, Number(sentinelState.opacity ?? 0.72)));

  setLayerVisibility(ids.analyzedFill, analyzedVisible);
  setLayerVisibility(ids.analyzedOutline, analyzedVisible);
  setLayerVisibility(ids.damagedFill, damagedVisible);
  setLayerVisibility(ids.damagedOutline, damagedVisible);

  if (state.map.getLayer(ids.damagedFill)) {
    state.map.setPaintProperty(ids.damagedFill, "fill-opacity", opacity);
  }

  if (state.map.getLayer(ids.damagedOutline)) {
    state.map.setPaintProperty(
      ids.damagedOutline,
      "line-opacity",
      Math.min(0.95, opacity + 0.12)
    );
  }

  moveLabelsToTop();
}
