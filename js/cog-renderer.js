"use strict";

import {
  BASE_LAYER_IDS,
  COG_RENDERER_SCRIPT_URLS,
  COMPARISON_LAYER_IDS,
  DATA_LAYER_IDS,
} from "./config.js";

import { state } from "./state.js";
import { hashString, safeMapId } from "./utils.js";
import { moveLabelsToTop, setLayerVisibility } from "./map.js";

const COG_SCRIPT_PROMISES = new Map();
const COG_META_CACHE = new Map();
const COG_TILE_CACHE = new Map();
const COG_STATE = new Map();
const COG_CATALOG = new Map();

let COG_PROTOCOL_REGISTERED = false;
let COG_TRANSPARENT_TILE_PROMISE = null;

let cogUiHandlers = {
  setStatus: () => {},
  showStatusProgress: () => {},
  renderDynamicLegend: () => {},
  t: (key) => key,
};

export function setCogUiHandlers(handlers = {}) {
  cogUiHandlers = {
    ...cogUiHandlers,
    ...handlers,
  };
}

function loadScriptOnce(url) {
  if (COG_SCRIPT_PROMISES.has(url)) {
    return COG_SCRIPT_PROMISES.get(url);
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

  COG_SCRIPT_PROMISES.set(url, promise);
  return promise;
}

async function ensureCogRenderingLibraries() {
  await loadScriptOnce(COG_RENDERER_SCRIPT_URLS.geotiff);

  if (!window.GeoTIFF) {
    throw new Error("GeoTIFF library did not expose window.GeoTIFF.");
  }

  await loadScriptOnce(COG_RENDERER_SCRIPT_URLS.proj4);

  if (!window.proj4) {
    throw new Error("proj4 library did not expose window.proj4.");
  }
}

function ensureProjDefinition(epsg) {
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

function detectCogEpsg(image, bbox) {
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

  return 32619;
}

function transformImageToLonLat(meta, x, y) {
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

function transformLonLatToImage(meta, lon, lat) {
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

function clampBounds(bounds) {
  const [west, south, east, north] = bounds;

  return [
    Math.max(-180, Math.min(180, west)),
    Math.max(-90, Math.min(90, south)),
    Math.max(-180, Math.min(180, east)),
    Math.max(-90, Math.min(90, north)),
  ];
}

async function getCogMeta(url) {
  const requestUrl = String(url || "").trim();

  if (!requestUrl) {
    throw new Error("COG URL is empty.");
  }

  if (COG_META_CACHE.has(requestUrl)) {
    return COG_META_CACHE.get(requestUrl);
  }

  const task = (async () => {
    await ensureCogRenderingLibraries();

    const tiff = await window.GeoTIFF.fromUrl(requestUrl);
    const image = await tiff.getImage();

    const bbox = image.getBoundingBox();
    const epsg = detectCogEpsg(image, bbox);

    ensureProjDefinition(4326);
    ensureProjDefinition(3857);
    ensureProjDefinition(epsg);

    const corners = [
      [bbox[0], bbox[1]],
      [bbox[0], bbox[3]],
      [bbox[2], bbox[1]],
      [bbox[2], bbox[3]],
    ]
      .map(([x, y]) => transformImageToLonLat({ epsg }, x, y))
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));

    let wgs84Bounds = null;

    if (corners.length) {
      const lons = corners.map((item) => item[0]);
      const lats = corners.map((item) => item[1]);
      wgs84Bounds = clampBounds([
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

  COG_META_CACHE.set(requestUrl, task);
  return task;
}

function tileXToLon(x, z) {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

function getTileLonLatBounds(z, x, y) {
  const west = tileXToLon(x, z);
  const east = tileXToLon(x + 1, z);
  const north = tileYToLat(y, z);
  const south = tileYToLat(y + 1, z);

  return [west, south, east, north];
}

function boundsIntersect(a, b) {
  return !(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3]);
}

async function getTransparentPngTile() {
  if (COG_TRANSPARENT_TILE_PROMISE) {
    return COG_TRANSPARENT_TILE_PROMISE;
  }

  COG_TRANSPARENT_TILE_PROMISE = new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    canvas.toBlob(async (blob) => {
      resolve(await blob.arrayBuffer());
    }, "image/png");
  });

  return COG_TRANSPARENT_TILE_PROMISE;
}

function scaleCogSampleToByte(value, bits = 8) {
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

function buildCogTilePng(rasters, meta, tileSize = 256) {
  const sampleCount = Math.min(meta.samplesPerPixel || rasters.length || 1, rasters.length || 1);
  const first = rasters[0];

  if (!first) {
    return getTransparentPngTile();
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

      r = scaleCogSampleToByte(rRaw, bits[0] || 8);
      g = scaleCogSampleToByte(gRaw, bits[1] || bits[0] || 8);
      b = scaleCogSampleToByte(bRaw, bits[2] || bits[0] || 8);

      if (
        hasNoData &&
        String(rRaw) === String(noData) &&
        String(gRaw) === String(noData) &&
        String(bRaw) === String(noData)
      ) {
        a = 0;
      }

      if (sampleCount >= 4 && rasters[3]) {
        a = scaleCogSampleToByte(rasters[3][index], bits[3] || 8);
      }
    } else {
      const value = rasters[0][index];
      const gray = scaleCogSampleToByte(value, bits[0] || 8);
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

async function renderCogTile(url, z, x, y) {
  const tileCacheKey = `${url}|${z}|${x}|${y}`;

  if (COG_TILE_CACHE.has(tileCacheKey)) {
    return COG_TILE_CACHE.get(tileCacheKey);
  }

  const task = (async () => {
    const meta = await getCogMeta(url);

    if (!meta.wgs84Bounds) {
      return getTransparentPngTile();
    }

    const tileLonLatBounds = getTileLonLatBounds(z, x, y);

    if (!boundsIntersect(tileLonLatBounds, meta.wgs84Bounds)) {
      return getTransparentPngTile();
    }

    const [west, south, east, north] = tileLonLatBounds;

    const imageCorners = [
      transformLonLatToImage(meta, west, south),
      transformLonLatToImage(meta, west, north),
      transformLonLatToImage(meta, east, south),
      transformLonLatToImage(meta, east, north),
    ].filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py));

    if (!imageCorners.length) {
      return getTransparentPngTile();
    }

    const xs = imageCorners.map((item) => item[0]);
    const ys = imageCorners.map((item) => item[1]);

    const bbox = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];

    if (!boundsIntersect(bbox, meta.bbox)) {
      return getTransparentPngTile();
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
      return getTransparentPngTile();
    }

    return buildCogTilePng(rasters, meta, 256);
  })();

  COG_TILE_CACHE.set(tileCacheKey, task);

  if (COG_TILE_CACHE.size > 384) {
    const firstKey = COG_TILE_CACHE.keys().next().value;
    COG_TILE_CACHE.delete(firstKey);
  }

  return task;
}

function parseCogProtocolUrl(rawUrl) {
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

async function ensureCogProtocolRegistered() {
  await ensureCogRenderingLibraries();

  if (COG_PROTOCOL_REGISTERED) {
    return;
  }

  if (!window.maplibregl?.addProtocol) {
    throw new Error("MapLibre addProtocol is not available.");
  }

  window.maplibregl.addProtocol("emsrcog", async (params) => {
    const parsed = parseCogProtocolUrl(params.url);
    const data = await renderCogTile(parsed.url, parsed.z, parsed.x, parsed.y);

    return {
      data,
      cacheControl: "max-age=3600",
    };
  });

  COG_PROTOCOL_REGISTERED = true;
}

export function cogItemKey(item) {
  return `${safeMapId(item?.productKey || "default")}-${hashString(item?.url || item?.label || "")}`;
}

export function getCogLayerState(key) {
  if (!COG_STATE.has(key)) {
    COG_STATE.set(key, {
      visible: false,
      opacity: 1.0,
    });
  }

  return COG_STATE.get(key);
}

export function registerCogCatalogItem(key, item) {
  if (key && item) {
    COG_CATALOG.set(key, item);
  }
}

export function getCogCatalogItem(key) {
  return COG_CATALOG.get(key);
}

function getCogLayerIds(key) {
  const safeKey = safeMapId(key);

  return {
    sourceId: `copernicus-source-image-${safeKey}`,
    layerId: `copernicus-source-image-layer-${safeKey}`,
  };
}

function findFirstOverlayLayerBeforeId() {
  const style = state.map?.getStyle?.();

  if (!style?.layers) {
    return state.map?.getLayer?.(BASE_LAYER_IDS.labels) ? BASE_LAYER_IDS.labels : undefined;
  }

  const overlayIds = new Set([
    ...COMPARISON_LAYER_IDS,
    ...Array.from(state.dynamicDataLayerIds || []),
    ...DATA_LAYER_IDS,
  ]);

  for (const layer of style.layers) {
    if (!layer?.id) continue;
    if (String(layer.id).startsWith("copernicus-source-image-layer-")) continue;

    if (overlayIds.has(layer.id)) {
      return layer.id;
    }
  }

  return state.map?.getLayer?.(BASE_LAYER_IDS.labels) ? BASE_LAYER_IDS.labels : undefined;
}

export async function addCogRasterLayer(item) {
  if (!state.mapReady || !state.map || !item?.url) {
    return;
  }

  const key = cogItemKey(item);
  const cogState = getCogLayerState(key);
  const ids = getCogLayerIds(key);
  const t = cogUiHandlers.t;

  cogUiHandlers.setStatus(
    "loading",
    t("sourceImageryLoadingTitle"),
    `${t("sourceImageryLoadingText")} ${item.label || ""}`,
    false
  );

  cogUiHandlers.showStatusProgress(null, "");

  try {
    await ensureCogProtocolRegistered();

    const meta = await getCogMeta(item.url);

    if (!state.map.getSource(ids.sourceId)) {
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

      state.map.addSource(ids.sourceId, sourceDefinition);
      state.dynamicSourceIds.add(ids.sourceId);
    }

    if (!state.map.getLayer(ids.layerId)) {
      state.map.addLayer(
        {
          id: ids.layerId,
          type: "raster",
          source: ids.sourceId,
          paint: {
            "raster-opacity": cogState.opacity,
            "raster-fade-duration": 120,
          },
        },
        findFirstOverlayLayerBeforeId()
      );

      state.dynamicDataLayerIds.add(ids.layerId);
    }

    setLayerVisibility(ids.layerId, true);
    state.map.setPaintProperty(ids.layerId, "raster-opacity", cogState.opacity);
    moveLabelsToTop();

    state.map.once("idle", () => {
      if (getCogLayerState(key).visible && state.map.getLayer(ids.layerId)) {
        cogUiHandlers.setStatus(
          "success",
          t("sourceImageryLoadedTitle"),
          `${item.label || ""} — ${t("sourceImageryLoadedText")}`,
          false
        );

        window.setTimeout(() => {
          if (state.els.status?.classList.contains("success")) {
            state.els.status.classList.add("hidden");
          }
        }, 3500);
      }
    });
  } catch (error) {
    console.error("COG source image load failed:", error);

    cogState.visible = false;

    cogUiHandlers.setStatus(
      "error",
      t("sourceImageryErrorTitle"),
      `${t("sourceImageryErrorText")}${error.message ? ` (${error.message})` : ""}`,
      false
    );

    cogUiHandlers.renderDynamicLegend(state.latestSelectedProductInfo);
  }
}

export function removeCogRasterLayer(itemOrKey) {
  const key = typeof itemOrKey === "string" ? itemOrKey : cogItemKey(itemOrKey);
  const ids = getCogLayerIds(key);

  if (state.map?.getLayer?.(ids.layerId)) {
    state.map.removeLayer(ids.layerId);
  }

  if (state.map?.getSource?.(ids.sourceId)) {
    state.map.removeSource(ids.sourceId);
  }

  state.dynamicDataLayerIds.delete(ids.layerId);
  state.dynamicSourceIds.delete(ids.sourceId);
}

export function setCogOpacity(key, opacity) {
  const cogState = getCogLayerState(key);
  cogState.opacity = Math.max(0, Math.min(1, Number(opacity) || 0));

  const ids = getCogLayerIds(key);

  if (state.map?.getLayer?.(ids.layerId)) {
    state.map.setPaintProperty(ids.layerId, "raster-opacity", cogState.opacity);
  }

  document.querySelectorAll("[data-cog-opacity-value], [data-imagery-opacity-value]").forEach((node) => {
    const nodeKey = String(node.dataset.cogOpacityValue || node.dataset.imageryOpacityValue || "");

    if (nodeKey === String(key)) {
      node.textContent = `${Math.round(cogState.opacity * 100)}%`;
    }
  });
}

export async function syncActiveCogLayersForCurrentInfo(info = state.latestSelectedProductInfo) {
  const activeKeys = new Set();

  (Array.isArray(info?.cogLayers) ? info.cogLayers : []).forEach((item) => {
    const key = cogItemKey(item);
    COG_CATALOG.set(key, item);

    if (getCogLayerState(key).visible) {
      activeKeys.add(key);
      addCogRasterLayer(item);
    }
  });

  for (const [key, cogState] of COG_STATE.entries()) {
    if (cogState.visible && !activeKeys.has(key)) {
      const ids = getCogLayerIds(key);

      if (state.map?.getLayer?.(ids.layerId) || state.map?.getSource?.(ids.sourceId)) {
        removeCogRasterLayer(key);
      }
    }
  }
}
