"use strict";

import {
  COPERNICUS_API_URL,
  COPERNICUS_CACHE_TTL_MS,
  COPERNICUS_MANIFEST_CACHE_KEY,
} from "./config.js";

import {
  clearForceRefreshUrlParam,
  formatBytesForProgress,
  isForceRefreshRequested,
} from "./utils.js";

const JSON_DOCUMENT_MEMORY_CACHE = new Map();

let apiUiHandlers = {
  showStatusProgress: () => {},
};

export function setApiUiHandlers(handlers = {}) {
  apiUiHandlers = {
    ...apiUiHandlers,
    ...handlers,
  };
}

export function isJsonDocumentMemoryCached(url) {
  return JSON_DOCUMENT_MEMORY_CACHE.has(String(url || "").trim());
}

export function isPotentiallyLargeCopernicusLayer(kind, url) {
  const text = `${kind || ""} ${url || ""}`.toLowerCase();

  return (
    kind === "groundMovementA" ||
    text.includes("groundmovement") ||
    text.includes("ground_movement") ||
    text.includes("ground-movement") ||
    text.includes("grm_product")
  );
}

export async function getCachedCopernicusManifest() {
  const now = Date.now();
  const cached = readCachedManifest();
  const forceRefresh = isForceRefreshRequested();

  if (!forceRefresh && cached && cached.expiresAt > now) {
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

export function readCachedManifest() {
  try {
    const raw = window.localStorage.getItem(COPERNICUS_MANIFEST_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || !parsed.manifest || !parsed.checkedAt || !parsed.expiresAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedManifest(payload) {
  try {
    window.localStorage.setItem(COPERNICUS_MANIFEST_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Could not write Copernicus manifest cache:", error);
  }
}

export function forceRefreshCopernicusData() {
  try {
    window.localStorage.removeItem(COPERNICUS_MANIFEST_CACHE_KEY);
  } catch {
    // Ignore localStorage errors.
  }

  window.location.reload();
}

function shouldReportDownloadProgress(requestUrl, label, options = {}) {
  if (options.reportProgress === false) {
    return false;
  }

  if (options.reportProgress === true) {
    return true;
  }

  const text = `${label || ""} ${requestUrl || ""}`.toLowerCase();

  return (
    text.includes("groundmovement") ||
    text.includes("ground_movement") ||
    text.includes("ground-movement") ||
    text.includes("grm_product")
  );
}

async function readResponseTextWithProgress(response) {
  const totalHeader = response.headers.get("content-length");
  const totalBytes = Number(totalHeader);
  const hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;

  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();

    if (hasTotal) {
      apiUiHandlers.showStatusProgress(
        100,
        `100% · ${formatBytesForProgress(totalBytes)} / ${formatBytesForProgress(totalBytes)}`
      );
    }

    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let receivedBytes = 0;
  let lastUiUpdate = 0;

  if (hasTotal) {
    apiUiHandlers.showStatusProgress(
      0,
      `0% · 0 B / ${formatBytesForProgress(totalBytes)}`
    );
  } else {
    apiUiHandlers.showStatusProgress(null, "0 B");
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
        apiUiHandlers.showStatusProgress(
          percent,
          `${Math.round(percent)}% · ${formatBytesForProgress(receivedBytes)} / ${formatBytesForProgress(totalBytes)}`
        );
      } else {
        apiUiHandlers.showStatusProgress(null, `${formatBytesForProgress(receivedBytes)}`);
      }
    }
  }

  if (hasTotal) {
    apiUiHandlers.showStatusProgress(
      100,
      `100% · ${formatBytesForProgress(receivedBytes)} / ${formatBytesForProgress(totalBytes)}`
    );
  } else {
    apiUiHandlers.showStatusProgress(null, `${formatBytesForProgress(receivedBytes)}`);
  }

  return await new Blob(chunks, {
    type: response.headers.get("content-type") || "application/json",
  }).text();
}

export async function fetchJsonDocument(url, label, options = {}) {
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
      cache: options.fetchCache || (cacheDocument ? "force-cache" : "no-store"),
      headers: {
        Accept: "application/json, application/geo+json, application/tilejson, */*",
      },
    });

    if (!response.ok) {
      throw new Error(`${label} HTTP ${response.status}: ${requestUrl}`);
    }

    const reportProgress = shouldReportDownloadProgress(requestUrl, label, options);

    const text = reportProgress
      ? await readResponseTextWithProgress(response)
      : await response.text();

    try {
      return JSON.parse(text);
    } catch {
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
