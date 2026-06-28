"use strict";

import { DEFAULT_AOI_NUMBER } from "./config.js";
import { state } from "./state.js";

export function getInitialAoiNumber() {
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

export function getInitialProductKey() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("product") || params.get("productId") || "").trim();
}

export function isForceRefreshRequested() {
  const params = new URLSearchParams(window.location.search);

  return (
    params.has("refresh") ||
    params.has("forceRefresh") ||
    params.has("nocache")
  );
}

export function clearForceRefreshUrlParam() {
  if (!isForceRefreshRequested() || !window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("refresh");
  url.searchParams.delete("forceRefresh");
  url.searchParams.delete("nocache");

  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export function updateAoiUrlParam(aoiNumber) {
  if (!window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("aoi", String(Number(aoiNumber)));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

export function updateSelectedProductUrlParam(productKey) {
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

export function clearSelectedProductUrlParam() {
  updateSelectedProductUrlParam("");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeMapId(value) {
  return String(value || "default")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default";
}

export function hashString(value) {
  let hash = 0;
  const text = String(value || "");

  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
}

export function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }

  return String(value).replace(/["\\]/g, "\\$&");
}

export function setNodeText(node, value) {
  if (!node) {
    return;
  }

  node.textContent = value || "—";
}

export function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }

  const locale =
    state.currentLang === "zh"
      ? "zh-CN"
      : state.currentLang === "it"
        ? "it-IT"
        : state.currentLang === "es"
          ? "es-ES"
          : "en-GB";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

export function formatUtcDateLabel(value) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return String(value || "");
  }

  const pad = (number) => String(number).padStart(2, "0");

  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} (UTC)`;
}

export function latestIsoFromValues(values) {
  const times = (values || [])
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!times.length) {
    return "";
  }

  return new Date(Math.max(...times)).toISOString();
}

export function formatAoiLabel(aoi) {
  if (!aoi) {
    return "AOI";
  }

  return `${String(aoi.number).padStart(2, "0")} ${aoi.name || ""}`.trim();
}

export function getBoundsFromWktPolygon(wkt) {
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

export function wktPolygonToGeoJson(wkt, properties = {}) {
  const matches = String(wkt).match(/-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) || [];

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

export function normalizeSummaryText(value) {
  return String(value || "").toLowerCase().trim();
}

export function readFirstTextProperty(properties, fields) {
  const props = properties || {};

  for (const field of fields || []) {
    const value = props[field];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return "";
}

export function lowerProperty(properties, field) {
  return normalizeSummaryText((properties || {})[field]);
}

export function allPropertiesText(properties) {
  return Object.entries(properties || {})
    .map(([key, value]) => `${key}:${value ?? ""}`)
    .join(" ")
    .toLowerCase();
}

export function includesAnyText(text, tokens) {
  return (tokens || []).some((token) => text.includes(token));
}

export function formatBytesForProgress(bytes) {
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
