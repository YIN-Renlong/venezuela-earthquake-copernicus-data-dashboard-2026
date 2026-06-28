"use strict";

import { WANTED_LAYER_ORDER } from "./config.js";
import { state } from "./state.js";

import {
  getInitialAoiNumber,
  getInitialProductKey,
  formatAoiLabel,
} from "./utils.js";

import {
  cleanOverrideUrls,
  extractCogLayersFromProduct,
  extractLayerUrlsFromProduct,
  findAoiByNumber,
  formatProductListLabel,
  getAllAois,
  getLatestAcquisitionTimeFromProducts,
  getLatestProductDeliveryTime,
  getLatestProductExpectedDelivery,
  getProductKey,
  getProductLabel,
  getProductsSortedForAoi,
  getSelectedProductsForAoi,
  chooseSelectedProductForAoi,
} from "./copernicus.js";

import {
  getCachedCopernicusManifest,
  setApiUiHandlers,
} from "./api.js";

import {
  addCopernicusLayer,
  applyLayerVisibility,
  clearCopernicusDataLayers,
  fitAoiExtent,
  initMap,
  moveLabelsToTop,
  showAoiExtent,
} from "./map.js";

import {
  applyLanguage,
  getAoiCardStatusText,
  initDomRefs,
  installMobileSidebarCloseButton,
  maybeShowLargeLayerDownloadNotice,
  renderAoiList,
  renderDataStatusPanel,
  renderDynamicLegend,
  renderProductSelector,
  setStatus,
  setupBasemapEvents,
  setupLanguageButtons,
  setupLayerToggleEvents,
  setupLegendOverlayEvents,
  setupUiEvents,
  showStatusProgress,
  t,
  updateDataStatusPanel,
} from "./ui.js";

import { setCogUiHandlers } from "./cog-renderer.js";

document.addEventListener("DOMContentLoaded", () => {
  state.selectedAoiNumber = getInitialAoiNumber();
  state.selectedProductKey = getInitialProductKey();

  initDomRefs();

  setApiUiHandlers({
    showStatusProgress,
  });

  setCogUiHandlers({
    setStatus,
    showStatusProgress,
    renderDynamicLegend,
    t,
  });

  setupLanguageButtons();
  setupUiEvents(loadAoi);
  setupBasemapEvents();
  setupLayerToggleEvents();
  setupLegendOverlayEvents();
  installMobileSidebarCloseButton();

  applyLanguage(state.currentLang);
  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  waitForMapLibreThenInit();
});

function waitForMapLibreThenInit() {
  if (window.maplibregl) {
    initMap(async () => {
      await loadAoi(state.selectedAoiNumber);
    });
    return;
  }

  setTimeout(waitForMapLibreThenInit, 50);
}

async function getCopernicusLayerInfo(aoiNumber = state.selectedAoiNumber) {
  const overrides = cleanOverrideUrls();

  const manifestInfo = await getCachedCopernicusManifest();
  const manifest = manifestInfo.manifest;

  state.latestAois = getAllAois(manifest);
  renderAoiList(state.latestAois);

  const aoi = findAoiByNumber(manifest, aoiNumber);

  if (!aoi) {
    throw new Error(
      `AOI${String(aoiNumber).padStart(2, "0")} not found in EMSR884 manifest.`
    );
  }

  const productOptions = getProductsSortedForAoi(aoi);
  const selectedProducts = getSelectedProductsForAoi(aoi, productOptions);
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

  if (!state.selectedProductKey && primaryProduct) {
    state.selectedProductKey = getProductKey(primaryProduct);
  }

  const effectiveProducts = selectedProducts.length ? selectedProducts : [primaryProduct];

  const productLayerEntries = effectiveProducts.map((product) => {
    const urls = extractLayerUrlsFromProduct(product);

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
    productSummary: formatProductListLabel(effectiveProducts),

    deliveryTime: getLatestProductDeliveryTime(effectiveProducts),
    expectedDelivery: getLatestProductExpectedDelivery(effectiveProducts),
    acquisitionTime: getLatestAcquisitionTimeFromProducts(effectiveProducts),

    lastChecked: manifestInfo.checkedAt,
    fromCache: manifestInfo.fromCache,
    cacheStale: manifestInfo.stale,
    cacheAgeMs: manifestInfo.cacheAgeMs,
    reportLink: manifest?.results?.[0]?.reportLink || "",
    productsPath: manifest?.results?.[0]?.productsPath || "",
    downloadPath: effectiveProducts.length === 1
      ? effectiveProducts[0]?.downloadPath || ""
      : manifest?.results?.[0]?.productsPath || "",
  });

  renderProductSelector(productOptions, primaryProduct);

  console.info("Selected Copernicus AOI/product mode/layers:", {
    aoiName: aoi.name,
    aoiNumber: aoi.number,
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

async function loadAoi(aoiNumber = state.selectedAoiNumber) {
  if (!state.mapReady || state.isLoading) return;

  const nextAoiNumber = Number(aoiNumber);
  state.selectedAoiNumber = Number.isFinite(nextAoiNumber)
    ? nextAoiNumber
    : state.selectedAoiNumber;

  state.isLoading = true;

  state.latestDataStatusMeta = {};
  state.latestSelectedProductInfo = null;
  renderDataStatusPanel();

  setStatus("loading", t("loadingTitle"), t("loadingText"), false);

  try {
    clearCopernicusDataLayers();

    const info = await getCopernicusLayerInfo(state.selectedAoiNumber);
    state.latestSelectedProductInfo = info;

    renderAoiList(state.latestAois);
    fitAoiExtent(info.aoi);
    showAoiExtent(info.aoi);

    const layerJobs = [];

    for (const entry of info.productLayerEntries || []) {
      for (const kind of WANTED_LAYER_ORDER) {
        const url = entry.urls?.[kind];

        if (url) {
          layerJobs.push([kind, url, entry.product]);
        }
      }
    }

    const results = [];

    for (const [kind, url, product] of layerJobs) {
      try {
        maybeShowLargeLayerDownloadNotice(kind, url);
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

    renderAoiList(state.latestAois);

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
      if (state.els.status?.classList.contains("success")) {
        state.els.status.classList.add("hidden");
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
    state.isLoading = false;
  }
}
