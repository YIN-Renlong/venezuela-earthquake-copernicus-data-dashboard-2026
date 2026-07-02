"use strict";

import {
  AOI_LAYER_IDS,
  GROUND_MOVEMENT_CLASSES,
  supplementalTranslations,
  translations,
} from "./config.js";

import { state, getLayerVisibility, setLayerVisibilityState } from "./state.js";

import {
  clearSelectedProductUrlParam,
  escapeHtml,
  formatDateTime,
  setNodeText,
  updateAoiUrlParam,
  updateSelectedProductUrlParam,
} from "./utils.js";

import {
  chooseAoiProduct,
  formatProductListLabel,
  formatProductSituationLabel,
  getOfficialProductDotClass,
  getOfficialProductStatusCode,
  getProductKey,
  getProductLabel,
  getProductsSortedForAoi,
  parseSelectedProductKeys,
  productHasCogLayers,
  productHasUsefulLayers,
  productHasVectorLayers,
  selectedProductKeyString,
} from "./copernicus.js";

import {
  applyLayerVisibility,
  getLoadedSourceMeta,
  setBasemap,
  visibilityKey,
} from "./map.js";

import {
  ensureSentinel1ComparisonLayers,
  updateSentinel1LayerVisibility,
} from "./sentinel1.js";

import {
  forceRefreshCopernicusData,
  isJsonDocumentMemoryCached,
  isPotentiallyLargeCopernicusLayer,
} from "./api.js";

import {
  addCogRasterLayer,
  cogItemKey,
  getCogCatalogItem,
  getCogLayerState,
  registerCogCatalogItem,
  removeCogRasterLayer,
  setCogOpacity,
  syncActiveCogLayersForCurrentInfo,
} from "./cog-renderer.js";

export function initDomRefs() {
  state.els.status = document.getElementById("map-status");
  state.els.statusTitle = document.getElementById("status-title");
  state.els.statusMessage = document.getElementById("status-message");
  state.els.retry = document.getElementById("retry-btn");
  state.els.labelsToggle = document.getElementById("satellite-labels-toggle");
  state.els.aoiList = document.getElementById("aoi-list");
  state.els.productPanel = document.getElementById("product-selector-panel");
  state.els.productList = document.getElementById("product-list");

  state.els.dataProduct = document.getElementById("data-product");
  state.els.dataDelivery = document.getElementById("data-delivery");
  state.els.dataAcquisition = document.getElementById("data-acquisition");
  state.els.dataLastChecked = document.getElementById("data-last-checked");
  state.els.dataSuccessfulLoad = document.getElementById("data-successful-load");
  state.els.dataCacheStatus = document.getElementById("data-cache-status");
  state.els.dataFreshnessBadge = document.getElementById("data-freshness-badge");
  state.els.dataReportLink = document.getElementById("data-report-link");
  state.els.dataDownloadLink = document.getElementById("data-download-link");
}

export function t(key) {
  const dictionary = translations[state.currentLang] || translations.es;
  const supplemental = supplementalTranslations[state.currentLang] || supplementalTranslations.es || {};

  return (
    dictionary[key] ||
    supplemental[key] ||
    (supplementalTranslations.es && supplementalTranslations.es[key]) ||
    key
  );
}

export function applyLanguage(lang) {
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

  if (state.latestAois.length) {
    renderAoiList(state.latestAois);
  }

  if (state.latestSelectedProductInfo) {
    renderDynamicLegend(state.latestSelectedProductInfo);
  }
}

export function setupLanguageButtons() {
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentLang = button.dataset.lang || "es";
      applyLanguage(state.currentLang);
    });
  });
}

export function setupUiEvents(loadAoi) {
  const oldCaracasButton = document.getElementById("load-caracas");

  if (oldCaracasButton) {
    oldCaracasButton.addEventListener("click", () => {
      state.selectedAoiNumber = 2;
      state.selectedProductKey = "";
      updateAoiUrlParam(2);
      clearSelectedProductUrlParam();
      closeMobileSidebar();
      loadAoi(2);
    });
  }

  if (state.els.aoiList) {
    state.els.aoiList.addEventListener("change", (event) => {
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

      if (!checkedKeys.length) {
        input.checked = true;
        return;
      }

      state.selectedProductKey = selectedProductKeyString(checkedKeys);
      updateSelectedProductUrlParam(state.selectedProductKey);
      loadAoi(state.selectedAoiNumber);
    });

    state.els.aoiList.addEventListener("click", (event) => {
      if (event.target.closest(".aoi-product-options")) {
        return;
      }

      const button = event.target.closest("[data-aoi-number]");

      if (!button) return;

      const aoiNumber = Number(button.dataset.aoiNumber);

      if (!Number.isFinite(aoiNumber)) {
        return;
      }

      state.selectedAoiNumber = aoiNumber;
      state.selectedProductKey = "";
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
      syncMobileSidebarA11y();
    });
  }

  if (state.els.retry) {
    state.els.retry.addEventListener("click", () => {
      loadAoi(state.selectedAoiNumber);
    });
  }

  const refreshDataButton = document.getElementById("refresh-data-btn");

  if (refreshDataButton) {
    refreshDataButton.addEventListener("click", () => {
      setStatus("loading", t("loadingTitle"), t("loadingText"), false);
      forceRefreshCopernicusData();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileSidebar();
    }
  });
}

export function setupBasemapEvents() {
  document.querySelectorAll("[data-basemap]").forEach((button) => {
    button.addEventListener("click", () => {
      setBasemap(button.dataset.basemap || "satellite");

      if (state.latestSelectedProductInfo) {
        renderDynamicLegend(state.latestSelectedProductInfo);
      }
    });
  });

  if (state.els.labelsToggle) {
    state.els.labelsToggle.addEventListener("change", (event) => {
      state.satelliteLabelsEnabled = event.target.checked;
      setBasemap(state.currentBasemap);

      if (state.latestSelectedProductInfo) {
        renderDynamicLegend(state.latestSelectedProductInfo);
      }
    });
  }
}

export function setupLayerToggleEvents() {
  const legend = document.getElementById("map-legend");

  if (!legend || legend.dataset.toggleDelegated === "1") {
    return;
  }

  legend.dataset.toggleDelegated = "1";

  legend.addEventListener("click", (event) => {
    const basemapButton = event.target.closest("[data-legend-basemap]");

    if (!basemapButton) {
      return;
    }

    const mode = basemapButton.dataset.legendBasemap || "satellite";
    setBasemap(mode);

    if (state.latestSelectedProductInfo) {
      renderDynamicLegend(state.latestSelectedProductInfo);
    }
  });

  legend.addEventListener("input", (event) => {
    const opacityInput = event.target.closest("[data-cog-opacity]");

    if (!opacityInput) {
      return;
    }

    const key = String(opacityInput.dataset.cogOpacity || "").trim();
    const opacity = Number(opacityInput.value) / 100;

    setCogOpacity(key, opacity);
  });

  legend.addEventListener("change", async (event) => {
    const cogInput = event.target.closest("[data-cog-toggle]");

    if (cogInput) {
      const key = String(cogInput.dataset.cogToggle || "").trim();
      const item = getCogCatalogItem(key);
      const cogState = getCogLayerState(key);

      cogState.visible = Boolean(cogInput.checked);

      renderDynamicLegend(state.latestSelectedProductInfo);

      if (cogState.visible && item) {
        await addCogRasterLayer(item);
      } else {
        removeCogRasterLayer(key);
      }

      return;
    }

    const labelsInput = event.target.closest("[data-basemap-labels-toggle]");

    if (labelsInput) {
      state.satelliteLabelsEnabled = Boolean(labelsInput.checked);

      if (state.els.labelsToggle) {
        state.els.labelsToggle.checked = state.satelliteLabelsEnabled;
      }

      setBasemap(state.currentBasemap);

      if (state.latestSelectedProductInfo) {
        renderDynamicLegend(state.latestSelectedProductInfo);
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
    syncLayerToggleInputs();
  });

  syncLayerToggleInputs();
}

function syncLegendCollapseButtonState(legend, button) {
  if (!legend || !button) {
    return;
  }

  const collapsed = legend.classList.contains("collapsed");

  button.textContent = collapsed ? "+" : "−";
  button.setAttribute(
    "aria-label",
    collapsed ? t("expandLegend") : t("collapseLegend")
  );
}

function installResponsiveLegendDefault(legend, button) {
  if (!legend || !button || legend.dataset.responsiveDefaultBound === "1") {
    return;
  }

  legend.dataset.responsiveDefaultBound = "1";

  const query = window.matchMedia("(max-width: 820px)");

  const applyDefault = () => {
    // Respect manual user choice after the user clicks the legend button.
    if (legend.dataset.userToggledLegend === "1") {
      syncLegendCollapseButtonState(legend, button);
      return;
    }

    // Mobile starts collapsed by default to protect map viewing space.
    // Desktop stays expanded by default.
    if (query.matches) {
      legend.classList.add("collapsed");
    } else {
      legend.classList.remove("collapsed");
    }

    syncLegendCollapseButtonState(legend, button);
  };

  applyDefault();

  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", applyDefault);
  } else if (typeof query.addListener === "function") {
    query.addListener(applyDefault);
  }
}

export function setupLegendOverlayEvents() {
  const legend = document.getElementById("map-legend");
  const button = document.getElementById("legend-collapse-btn");

  if (legend && button) {
    installResponsiveLegendDefault(legend, button);

    button.addEventListener("click", () => {
      legend.dataset.userToggledLegend = "1";
      legend.classList.toggle("collapsed");
      syncLegendCollapseButtonState(legend, button);
    });

    syncLegendCollapseButtonState(legend, button);
  }

  setupImageryComparisonPanelEvents();
}

export function syncLayerToggleInputs() {
  document.querySelectorAll("[data-layer-toggle]").forEach((input) => {
    const key = String(input.dataset.layerToggle || "").trim();

    if (!key) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(state.layerVisibility, key)) {
      state.layerVisibility[key] = Boolean(input.checked);
    }

    const checked = Boolean(state.layerVisibility[key]);
    input.checked = checked;
    input.closest(".legend-toggle")?.classList.toggle("off", !checked);
  });
}

function getOfficialProductBaseStatusText(product) {
  const status = getOfficialProductStatusCode(product);
  const hasVector = productHasVectorLayers(product);

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

export function getAoiCardStatusText(product) {
  if (!product) {
    return t("aoiProcessing");
  }

  const status = getOfficialProductStatusCode(product);
  const hasVector = productHasVectorLayers(product);
  const hasCog = productHasCogLayers(product);

  const parts = [
    getOfficialProductBaseStatusText(product),
  ];

  if (hasCog && !hasVector && status !== "F") {
    parts.push(t("sourceImageOnly"));
  }

  const time =
    product?.expectedDelivery ||
    product?.version?.deliveryTime ||
    "";

  if (time) {
    parts.push(formatDateTime(time));
  }

  return parts.filter(Boolean).join(" · ");
}

function getAoiStatusClass(product) {
  const dot = getOfficialProductDotClass(product);

  if (dot === "green") return "status-green-aoi";
  if (dot === "red") return "status-red-aoi";
  if (dot === "amber") return "status-amber-aoi";

  return "status-amber-aoi";
}

function getProductCheckStatusClass(product) {
  const dot = getOfficialProductDotClass(product);

  if (dot === "green") return "status-green-product-check";
  if (dot === "red") return "status-red-product-check";
  if (dot === "amber") return "status-amber-product-check";

  return "status-neutral-product-check";
}

function formatProductStatusLine(product) {
  return getAoiCardStatusText(product);
}

function renderInlineProductOptions(aoi) {
  const products = getProductsSortedForAoi(aoi);

  if (products.length <= 1) {
    return "";
  }

  const selectedKeys = new Set(parseSelectedProductKeys(products));

  const productRows = products.map((product) => {
    const productKey = getProductKey(product);
    const available = productHasUsefulLayers(product);
    const checked = selectedKeys.has(productKey);
    const statusLine = formatProductStatusLine(product);
    const statusClass = getProductCheckStatusClass(product);

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

export function renderAoiList(aois = state.latestAois) {
  if (!state.els.aoiList || !Array.isArray(aois) || !aois.length) {
    return;
  }

  state.els.aoiList.innerHTML = aois
    .map((aoi) => {
      const product = chooseAoiProduct(aoi);
      const selectable = productHasUsefulLayers(product);
      const selected = Number(aoi.number) === Number(state.selectedAoiNumber);

      const numberText = String(aoi.number).padStart(2, "0");
      const name = aoi.name || `AOI${numberText}`;
      const dotClass = getOfficialProductDotClass(product);
      const statusClass = getAoiStatusClass(product);

      const entryClasses = [
        "aoi-entry",
        statusClass,
        selected ? "selected-aoi-entry" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const cardClasses = [
        "aoi-card",
        `${statusClass}-card`,
        selectable ? "available-aoi" : "disabled placeholder-aoi",
        selected ? "active-aoi" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const productLabel = getProductLabel(product);
      const statusText = getAoiCardStatusText(product);

      return `
        <div class="${entryClasses}">
          <button
            class="${cardClasses}"
            type="button"
            data-aoi-number="${Number(aoi.number)}"
            aria-disabled="${selectable ? "false" : "true"}"
            title="${escapeHtml(statusText)}"
          >
            <span class="status-dot ${dotClass}" aria-hidden="true"></span>
            <span class="aoi-card-text">
              <strong>${escapeHtml(numberText)} ${escapeHtml(name)}</strong>
              <small>${escapeHtml(productLabel)} · ${escapeHtml(statusText)}</small>
            </span>
          </button>
          ${selected ? renderInlineProductOptions(aoi) : ""}
        </div>
      `;
    })
    .join("");
}

export function renderProductSelector(products = state.currentProductOptions) {
  state.currentProductOptions = Array.isArray(products) ? products : [];

  if (state.els.productPanel) {
    state.els.productPanel.classList.add("hidden");
  }

  if (state.els.productList) {
    state.els.productList.innerHTML = "";
  }
}

export function updateDataStatusPanel(partial) {
  state.latestDataStatusMeta = {
    ...state.latestDataStatusMeta,
    ...partial,
  };

  renderDataStatusPanel();
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
  if (!state.els.dataFreshnessBadge) {
    return;
  }

  const delivery = meta.deliveryTime || meta.expectedDelivery || meta.acquisitionTime;

  if (!delivery) {
    state.els.dataFreshnessBadge.textContent = t("notAvailable");
    state.els.dataFreshnessBadge.className = "freshness-badge neutral";
    return;
  }

  const ageMs = Date.now() - new Date(delivery).getTime();

  if (!Number.isFinite(ageMs)) {
    state.els.dataFreshnessBadge.textContent = t("notAvailable");
    state.els.dataFreshnessBadge.className = "freshness-badge neutral";
    return;
  }

  const hours = ageMs / 36e5;

  if (meta.cacheStale) {
    state.els.dataFreshnessBadge.textContent = `${t("cacheStale")} · ${Math.round(hours)}h`;
    state.els.dataFreshnessBadge.className = "freshness-badge stale";
    return;
  }

  if (hours <= 6) {
    state.els.dataFreshnessBadge.textContent = `${t("newData")} · ${Math.max(0, Math.round(hours))}h`;
    state.els.dataFreshnessBadge.className = "freshness-badge fresh";
    return;
  }

  if (hours <= 24) {
    state.els.dataFreshnessBadge.textContent = `${t("recentData")} · ${Math.round(hours)}h`;
    state.els.dataFreshnessBadge.className = "freshness-badge recent";
    return;
  }

  state.els.dataFreshnessBadge.textContent = `${t("olderData")} · ${Math.round(hours / 24)}d`;
  state.els.dataFreshnessBadge.className = "freshness-badge old";
}

export function renderDataStatusPanel() {
  if (!state.els.dataProduct) {
    return;
  }

  const meta = state.latestDataStatusMeta || {};

  const aoiText = meta.aoiName
    ? `${meta.aoiName} AOI${String(meta.aoiNumber ?? "").padStart(2, "0")}`
    : "AOI";

  const productParts = [aoiText];

  if (meta.productSummary) {
    productParts.push(meta.productSummary);
  } else if (meta.productType) {
    productParts.push(meta.productType);
  }

  setNodeText(state.els.dataProduct, productParts.join(" · "));
  setNodeText(state.els.dataDelivery, formatDateTime(meta.deliveryTime || meta.expectedDelivery));
  setNodeText(state.els.dataAcquisition, formatDateTime(meta.acquisitionTime));
  setNodeText(state.els.dataLastChecked, formatDateTime(meta.lastChecked));
  setNodeText(state.els.dataSuccessfulLoad, formatDateTime(meta.successfulLoadTime));
  setNodeText(state.els.dataCacheStatus, formatCacheStatus(meta));

  if (state.els.dataReportLink && meta.reportLink) {
    state.els.dataReportLink.href = meta.reportLink;
    state.els.dataReportLink.classList.remove("hidden");
  }

  if (state.els.dataDownloadLink) {
    const downloadUrl = meta.downloadPath || meta.productsPath || "";

    if (downloadUrl) {
      state.els.dataDownloadLink.href = downloadUrl;
      state.els.dataDownloadLink.classList.remove("hidden");
      state.els.dataDownloadLink.textContent = "ZIP";
    } else {
      state.els.dataDownloadLink.classList.add("hidden");
    }
  }

  renderFreshnessBadge(meta);
}

function orderedDamageClasses(classes) {
  const order = ["destroyed", "damaged", "possible"];

  if (!Array.isArray(classes)) {
    return order;
  }

  return order.filter((item) => classes.includes(item));
}

function getDamageClassesForLegend(kind, productKey) {
  const meta = getLoadedSourceMeta(kind, productKey);

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.damageClasses)) {
    return orderedDamageClasses(meta.damageClasses);
  }

  return ["destroyed", "damaged", "possible"];
}

function getTransportClassesForLegend(productKey) {
  const meta = getLoadedSourceMeta("transportationL", productKey);
  const order = ["highway", "main", "local", "track", "airfieldRunway", "railway"];

  if (!meta) {
    return [];
  }

  if (Array.isArray(meta.transportClasses)) {
    return order.filter((item) => meta.transportClasses.includes(item));
  }

  return order;
}

function getTransportAreaClassesForLegend(productKey) {
  const meta = getLoadedSourceMeta("transportationA", productKey);

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

function getCrisisClassesForLegend(productKey) {
  const meta = getLoadedSourceMeta("ancillaryCrisisInfoP", productKey);

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

function renderDamageLegendSection(productKey, kind, title, geometry = "area") {
  const classes = getDamageClassesForLegend(kind, productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) => {
    const key = visibilityKey(productKey, kind, className);
    const swatchClass = geometry === "point"
      ? `point-swatch ${className}`
      : `swatch ${className}`;

    return renderToggleRow({
      key,
      swatchHtml: `<span class="${escapeHtml(swatchClass)}"></span>`,
      label: damageClassLabel(className),
      checked: true,
    });
  });

  return renderLegendSection(title, rows);
}

function renderTransportLegendSection(productKey) {
  const classes = getTransportClassesForLegend(productKey);

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
      key: visibilityKey(productKey, "transportationL", className),
      swatchHtml: `<span class="line-swatch ${escapeHtml(swatches[className] || "local-road")}"></span>`,
      label: labels[className] || className,
      checked: true,
      extraClass: "transport-toggle",
    })
  );

  return renderLegendSection(t("transportationGrading"), rows);
}

function renderTransportationAreaLegendSection(productKey) {
  const classes = getTransportAreaClassesForLegend(productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) =>
    renderToggleRow({
      key: visibilityKey(productKey, "transportationA", className),
      swatchHtml: '<span class="area-swatch transport-area-damaged"></span>',
      label: t("airfieldAndHeliportDamaged"),
      checked: true,
    })
  );

  return renderLegendSection(t("transportationArea"), rows);
}

function renderCrisisLegendSection(productKey) {
  const classes = getCrisisClassesForLegend(productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) =>
    renderToggleRow({
      key: visibilityKey(productKey, "ancillaryCrisisInfoP", className),
      swatchHtml: '<span class="crisis-swatch"></span>',
      label: t("blockedRoadInterruption"),
      checked: true,
    })
  );

  return renderLegendSection(t("crisisPoints"), rows);
}

function renderFacilitiesLegendSection(productKey) {
  const classes = getDamageClassesForLegend("facilitiesA", productKey);

  if (!classes.length) {
    return "";
  }

  const rows = classes.map((className) => {
    const swatch =
      className === "possible"
        ? '<span class="area-swatch facility-possible"></span>'
        : '<span class="area-swatch facility-damaged"></span>';

    return renderToggleRow({
      key: visibilityKey(productKey, "facilitiesA", className),
      swatchHtml: swatch,
      label: damageClassLabel(className),
      checked: true,
    });
  });

  return renderLegendSection(t("facilitiesArea"), rows);
}

function renderNotAnalysedLegendSection(productKey) {
  if (!getLoadedSourceMeta("notAnalysedA", productKey)) {
    return "";
  }

  return renderLegendSection(
    t("notAnalysed"),
    renderToggleRow({
      key: visibilityKey(productKey, "notAnalysedA", "default"),
      swatchHtml: '<span class="swatch hatch"></span>',
      label: t("notAnalysed"),
      checked: false,
    })
  );
}

function renderGroundMovementLegendSection(productKey) {
  if (!getLoadedSourceMeta("groundMovementA", productKey)) {
    return "";
  }

  const rows = [
    `<div class="legend-subtitle">${escapeHtml(t("groundMovementM"))}</div>`,
    ...GROUND_MOVEMENT_CLASSES.map((item) =>
      renderToggleRow({
        key: visibilityKey(productKey, "groundMovementA", item.key),
        swatchHtml: `<span class="ground-swatch gm-${escapeHtml(item.id)}"></span>`,
        label: item.value,
        checked: true,
      })
    ),
  ];

  return renderLegendSection(t("groundMovementGrading"), rows);
}

const IMAGERY_AUTO_COMPACT_DELAY_MS = 5000;
let imageryAutoCompactTimer = null;

function getImageryPanelElement() {
  return document.getElementById("source-imagery-panel");
}

function clearImageryAutoCompactTimer() {
  if (imageryAutoCompactTimer) {
    window.clearTimeout(imageryAutoCompactTimer);
    imageryAutoCompactTimer = null;
  }
}

function updateImageryPanelButton() {
  const panel = getImageryPanelElement();
  const collapseButton = document.getElementById("source-imagery-collapse-btn");

  if (!panel || !collapseButton) {
    return;
  }

  // The imagery panel now has only two states:
  // 1. full panel
  // 2. compact transparent bar
  //
  // The old title-only collapsed state is intentionally no longer used.
  const compact = panel.classList.contains("auto-compact");

  collapseButton.textContent = compact ? "+" : "−";
  collapseButton.setAttribute(
    "aria-label",
    compact ? t("expandImageryPanel") : t("collapseImageryPanel")
  );

  window.requestAnimationFrame(fitImageryCompactText);
}

function expandImageryPanelFromAutoCompact() {
  const panel = getImageryPanelElement();

  if (!panel) {
    return;
  }

  panel.classList.remove("collapsed");

  if (panel.classList.contains("auto-compact")) {
    panel.classList.remove("auto-compact");
    updateImageryPanelButton();
  }
}

function compactImageryPanelNow() {
  const panel = getImageryPanelElement();

  if (!panel || panel.classList.contains("hidden")) {
    return;
  }

  if (panel.matches(":hover") || panel.contains(document.activeElement)) {
    scheduleImageryAutoCompact();
    return;
  }

  panel.classList.remove("collapsed");
  panel.classList.add("auto-compact");
  updateImageryPanelButton();
}

function scheduleImageryAutoCompact(delay = IMAGERY_AUTO_COMPACT_DELAY_MS) {
  const panel = getImageryPanelElement();

  clearImageryAutoCompactTimer();

  if (!panel || panel.classList.contains("hidden")) {
    return;
  }

  imageryAutoCompactTimer = window.setTimeout(() => {
    compactImageryPanelNow();
  }, delay);
}

function getImageryCompactStatusInfo(info = state.latestSelectedProductInfo) {
  const cogs = getSortedImageryItems(info);
  const activeCogs = cogs.filter((item) => getCogLayerState(cogItemKey(item)).visible);
  const sentinelActive = Boolean(
    state.sentinel1?.damagedVisible || state.sentinel1?.analyzedVisible
  );

  const activeCount = activeCogs.length + (sentinelActive ? 1 : 0);

  if (!activeCount) {
    return {
      active: false,
      available: true,
      text: t("sourceImageryAvailable"),
    };
  }

  return {
    active: true,
    available: false,
    text: activeCount === 1
      ? t("sourceImageryActive")
      : `${t("sourceImageryActive")} · ${activeCount}`,
  };
}

function updateImageryCompactStatus(info = state.latestSelectedProductInfo) {
  const node = document.getElementById("source-imagery-compact-status");
  const panel = getImageryPanelElement();

  if (!node) {
    return;
  }

  const status = getImageryCompactStatusInfo(info);

  node.textContent = status.text;
  node.classList.toggle("active", status.active);
  node.classList.toggle("available", status.available);
  node.classList.toggle("hidden", !status.text);

  if (panel) {
    panel.classList.toggle("has-active-imagery", status.active);
    panel.classList.toggle("has-available-imagery", status.available);
  }

  window.requestAnimationFrame(fitImageryCompactText);
}

function fitImageryCompactText() {
  const panel = getImageryPanelElement();

  if (!panel) {
    return;
  }

  const header = panel.querySelector(".imagery-panel-header");

  panel.style.setProperty("--imagery-compact-font-scale", "1");

  // When the panel is full-size, remove any compact inline sizing.
  if (!panel.classList.contains("auto-compact")) {
    panel.style.removeProperty("width");

    if (header) {
      header.style.removeProperty("width");
      header.style.removeProperty("max-width");
    }

    return;
  }

  const title = panel.querySelector(".imagery-panel-header strong");
  const status = panel.querySelector(".imagery-compact-status:not(.hidden)");
  const button = panel.querySelector(".imagery-collapse-btn");
  const textGroup = title?.parentElement || null;

  if (!header || !title || !button || !textGroup) {
    return;
  }

  // Clear previous measured width before measuring actual content.
  panel.style.removeProperty("width");
  header.style.removeProperty("width");
  header.style.removeProperty("max-width");

  const headerStyle = window.getComputedStyle(header);
  const groupStyle = window.getComputedStyle(textGroup);

  const headerGap =
    Number.parseFloat(headerStyle.columnGap || headerStyle.gap || "10") || 10;

  const groupGap =
    Number.parseFloat(groupStyle.columnGap || groupStyle.gap || "9") || 9;

  const paddingLeft = Number.parseFloat(headerStyle.paddingLeft || "0") || 0;
  const paddingRight = Number.parseFloat(headerStyle.paddingRight || "0") || 0;

  const statusVisible = Boolean(status && status.textContent.trim());

  const titleWidth = title.scrollWidth;
  const statusWidth = statusVisible ? status.scrollWidth : 0;

  const textWidth =
    titleWidth +
    (statusVisible ? groupGap + statusWidth : 0);

  const buttonWidth = button.offsetWidth || 26;

  const desiredWidth = Math.ceil(
    paddingLeft +
    textWidth +
    headerGap +
    buttonWidth +
    paddingRight +
    2
  );

  const viewportPadding = window.matchMedia("(max-width: 820px)").matches ? 24 : 32;
  const maxWidth = Math.max(220, window.innerWidth - viewportPadding);

  let targetWidth = desiredWidth;
  let scale = 1;

  if (desiredWidth > maxWidth) {
    const availableTextWidth = Math.max(
      80,
      maxWidth - paddingLeft - headerGap - buttonWidth - paddingRight - 2
    );

    scale = Math.max(0.52, Math.min(1, availableTextWidth / Math.max(1, textWidth)));
    targetWidth = maxWidth;
  }

  panel.style.setProperty("--imagery-compact-font-scale", scale.toFixed(3));

  // This is intentionally inline + important because earlier responsive CSS
  // rules can otherwise keep the compact overlay stretched and leave empty
  // space after the plus button.
  panel.style.setProperty("width", `${targetWidth}px`, "important");
  header.style.setProperty("width", `${targetWidth}px`, "important");
  header.style.setProperty("max-width", `${targetWidth}px`, "important");
}

function getSortedImageryItems(info = state.latestSelectedProductInfo) {
  return (Array.isArray(info?.cogLayers) ? info.cogLayers : [])
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a?.acquisitionTime || "").getTime();
      const bTime = new Date(b?.acquisitionTime || "").getTime();

      const aValue = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
      const bValue = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;

      if (aValue !== bValue) {
        return aValue - bValue;
      }

      return String(a?.label || "").localeCompare(String(b?.label || ""));
    });
}

function getImageryPositionLabel(index, total) {
  if (total <= 1) {
    return t("sourceImageryAcquisition");
  }

  if (index === 0) {
    return t("earlierAcquisition");
  }

  if (index === total - 1) {
    return t("latestAcquisition");
  }

  return `${t("sourceImageryAcquisition")} ${index + 1}`;
}

function turnOffOtherImageryLayers(keepKey, info = state.latestSelectedProductInfo) {
  getSortedImageryItems(info).forEach((item) => {
    const key = cogItemKey(item);

    if (key === keepKey) {
      return;
    }

    const cogState = getCogLayerState(key);
    cogState.visible = false;
    removeCogRasterLayer(key);
  });
}

function enforceSingleImagerySelection(info = state.latestSelectedProductInfo) {
  if (state.imageryOverlayMode) {
    return;
  }

  const visible = getSortedImageryItems(info)
    .map((item) => ({ item, key: cogItemKey(item), cogState: getCogLayerState(cogItemKey(item)) }))
    .filter((entry) => entry.cogState.visible);

  if (visible.length <= 1) {
    return;
  }

  const keepKey = visible[visible.length - 1].key;
  turnOffOtherImageryLayers(keepKey, info);
}

function setupImageryComparisonPanelEvents() {
  const panel = document.getElementById("source-imagery-panel");

  if (!panel || panel.dataset.bound === "1") {
    return;
  }

  panel.dataset.bound = "1";

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(fitImageryCompactText);
  });

  const collapseButton = document.getElementById("source-imagery-collapse-btn");

  if (collapseButton) {
    collapseButton.addEventListener("click", () => {
      const wasAutoCompact = panel.classList.contains("auto-compact");

      clearImageryAutoCompactTimer();
      panel.classList.remove("collapsed");

      if (wasAutoCompact) {
        panel.classList.remove("auto-compact");
        updateImageryPanelButton();
        scheduleImageryAutoCompact();
        return;
      }

      // Manual hide now uses the same compact transparent bar as the
      // 5-second auto-compact behavior. The old title-only collapsed
      // state is no longer used.
      panel.classList.add("auto-compact");
      updateImageryPanelButton();
    });
  }

  panel.addEventListener("mouseenter", () => {
    clearImageryAutoCompactTimer();
    expandImageryPanelFromAutoCompact();
  });

  panel.addEventListener("mouseleave", () => {
    scheduleImageryAutoCompact();
  });

  panel.addEventListener("focusin", () => {
    clearImageryAutoCompactTimer();
    expandImageryPanelFromAutoCompact();
  });

  panel.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!panel.contains(document.activeElement)) {
        scheduleImageryAutoCompact();
      }
    }, 0);
  });

  panel.addEventListener("click", (event) => {
    if (panel.classList.contains("auto-compact") && !event.target.closest("button")) {
      expandImageryPanelFromAutoCompact();
      scheduleImageryAutoCompact();
      return;
    }

    if (
      event.target.closest("a") ||
      event.target.closest("button") ||
      event.target.closest("input") ||
      event.target.closest("label")
    ) {
      return;
    }

    const item = event.target.closest(".imagery-item");

    if (!item || !panel.contains(item)) {
      return;
    }

    const checkbox = item.querySelector("[data-imagery-toggle]");

    if (!checkbox) {
      return;
    }

    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  });

  panel.addEventListener("input", (event) => {
    const sentinelOpacityInput = event.target.closest("[data-sentinel1-opacity]");

    if (sentinelOpacityInput) {
      const opacity = Math.max(0, Math.min(1, Number(sentinelOpacityInput.value) / 100));
      state.sentinel1.opacity = opacity;

      document.querySelectorAll("[data-sentinel1-opacity-value]").forEach((node) => {
        node.textContent = `${Math.round(opacity * 100)}%`;
      });

      updateSentinel1LayerVisibility();
      updateImageryCompactStatus(state.latestSelectedProductInfo);
      return;
    }

    const opacityInput = event.target.closest("[data-imagery-opacity]");
  
    if (!opacityInput) {
      return;
    }
  
    const key = String(opacityInput.dataset.imageryOpacity || "").trim();
    const opacity = Number(opacityInput.value) / 100;
  
    setCogOpacity(key, opacity);
  });

  panel.addEventListener("change", async (event) => {
    const overlayInput = event.target.closest("[data-imagery-overlay-mode]");

    if (overlayInput) {
      state.imageryOverlayMode = Boolean(overlayInput.checked);

      if (!state.imageryOverlayMode) {
        enforceSingleImagerySelection(state.latestSelectedProductInfo);
      }

      renderImageryComparisonPanel(state.latestSelectedProductInfo);
      return;
    }

    const sentinelInput = event.target.closest("[data-sentinel1-toggle]");

    if (sentinelInput) {
      const layer = String(sentinelInput.dataset.sentinel1Toggle || "").trim();
      const checked = Boolean(sentinelInput.checked);

      if (layer === "damaged") {
        state.sentinel1.damagedVisible = checked;

        // When likely damaged structures are enabled, automatically show
        // the analyzed-area boundary so empty areas are not misread as
        // "no damage".
        if (checked) {
          state.sentinel1.analyzedVisible = true;
        }
      }

      if (layer === "analyzed") {
        state.sentinel1.analyzedVisible = checked;
      }

      renderImageryComparisonPanel(state.latestSelectedProductInfo);
      await syncSentinel1ComparisonLayerFromState(true);
      return;
    }

    const imageryInput = event.target.closest("[data-imagery-toggle]");

    if (!imageryInput) {
      return;
    }

    const key = String(imageryInput.dataset.imageryToggle || "").trim();
    const item = getCogCatalogItem(key);
    const cogState = getCogLayerState(key);
    const nextVisible = Boolean(imageryInput.checked);

    if (nextVisible && !state.imageryOverlayMode) {
      turnOffOtherImageryLayers(key, state.latestSelectedProductInfo);
    }

    cogState.visible = nextVisible;

    renderImageryComparisonPanel(state.latestSelectedProductInfo);

    if (nextVisible && item) {
      await addCogRasterLayer(item);
    } else {
      removeCogRasterLayer(key);
    }
  });
}

async function syncSentinel1ComparisonLayerFromState(showMessages = false) {
  const shouldBeVisible = Boolean(
    state.sentinel1?.damagedVisible || state.sentinel1?.analyzedVisible
  );

  if (!shouldBeVisible) {
    updateSentinel1LayerVisibility();
    updateImageryCompactStatus(state.latestSelectedProductInfo);
    return;
  }

  if (showMessages) {
    setStatus("loading", t("sentinel1LoadingTitle"), t("sentinel1LoadingText"), false);
  }

  try {
    await ensureSentinel1ComparisonLayers();
    updateSentinel1LayerVisibility();
    updateImageryCompactStatus(state.latestSelectedProductInfo);

    if (showMessages) {
      setStatus("success", t("sentinel1LoadedTitle"), t("sentinel1LoadedText"), false);

      window.setTimeout(() => {
        if (state.els.status?.classList.contains("success")) {
          state.els.status.classList.add("hidden");
        }
      }, 3200);
    }
  } catch (error) {
    console.error("Sentinel-1 comparison layer failed:", error);

    state.sentinel1.damagedVisible = false;
    state.sentinel1.analyzedVisible = false;
    updateSentinel1LayerVisibility();
    renderImageryComparisonPanel(state.latestSelectedProductInfo);

    setStatus(
      "error",
      t("sentinel1ErrorTitle"),
      `${t("sentinel1ErrorText")}${error.message ? ` (${error.message})` : ""}`,
      false
    );
  }
}

function renderSentinel1ComparisonSection() {
  const sentinelState = state.sentinel1 || {};
  const opacityPercent = Math.round((sentinelState.opacity ?? 0.72) * 100);

  return `
    <div class="imagery-panel-section sentinel-comparison-section">
      <div class="imagery-section-title">${escapeHtml(t("sentinel1RadarAnalysis"))}</div>

      <div class="sentinel-toggle-list">
        <label class="sentinel-toggle-row">
          <input
            class="imagery-checkbox"
            type="checkbox"
            data-sentinel1-toggle="analyzed"
            ${sentinelState.analyzedVisible ? "checked" : ""}
          />
          <span class="sentinel-area-swatch"></span>
          <span>${escapeHtml(t("sentinel1AnalyzedArea"))}</span>
        </label>

        <label class="sentinel-toggle-row">
          <input
            class="imagery-checkbox"
            type="checkbox"
            data-sentinel1-toggle="damaged"
            ${sentinelState.damagedVisible ? "checked" : ""}
          />
          <span class="sentinel-damage-swatch"></span>
          <span>${escapeHtml(t("sentinel1LikelyDamagedStructures"))}</span>
        </label>
      </div>

      <label class="sentinel-opacity-row ${sentinelState.damagedVisible ? "" : "hidden"}">
        <span>${escapeHtml(t("sentinel1Opacity"))}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value="${opacityPercent}"
          data-sentinel1-opacity="1"
        />
        <strong data-sentinel1-opacity-value="1">${opacityPercent}%</strong>
      </label>

      <p class="sentinel-note">${escapeHtml(t("sentinel1Note"))}</p>
    </div>
  `;
}

function renderCopernicusSourceImagerySection(cogs) {
  const productKeys = new Set(cogs.map((item) => String(item.productKey || "")));
  const showProductBadge = productKeys.size > 1;

  if (!cogs.length) {
    return `
      <div class="imagery-panel-section">
        <div class="imagery-section-title">${escapeHtml(t("copernicusSourceImagery"))}</div>
        <div class="imagery-empty">${escapeHtml(t("noCopernicusSourceImagery"))}</div>
      </div>
    `;
  }

  const overlayMode = cogs.length > 1
    ? `
      <label class="imagery-overlay-mode">
        <input
          type="checkbox"
          data-imagery-overlay-mode="1"
          ${state.imageryOverlayMode ? "checked" : ""}
        />
        <span>${escapeHtml(t("overlayMultipleImages"))}</span>
      </label>
    `
    : "";

  const rows = cogs.map((item, index) => {
    const key = cogItemKey(item);
    registerCogCatalogItem(key, item);

    const cogState = getCogLayerState(key);
    const opacityPercent = Math.round(cogState.opacity * 100);
    const positionLabel = getImageryPositionLabel(index, cogs.length);
    const productBadge = showProductBadge && item.productLabel
      ? `<span class="imagery-product-badge">${escapeHtml(item.productLabel)}</span>`
      : "";

    return `
      <div class="imagery-item ${cogState.visible ? "active-imagery-item" : ""}">
        <div class="imagery-row">
          <label class="imagery-select-label">
            <input
              class="imagery-checkbox"
              type="checkbox"
              data-imagery-toggle="${escapeHtml(key)}"
              ${cogState.visible ? "checked" : ""}
            />
            <span class="image-swatch"></span>
            <span class="imagery-text">
              <span class="imagery-title-line">
                <span class="imagery-time-badge">${escapeHtml(positionLabel)}</span>
                ${productBadge}
                <span>${escapeHtml(item.label)}</span>
              </span>
            </span>
          </label>

          <a
            class="imagery-tiff-link"
            href="${escapeHtml(item.url)}"
            target="_blank"
            rel="noopener noreferrer"
            title="Open TIFF"
          >TIFF</a>
        </div>

        <label class="imagery-opacity-row ${cogState.visible ? "" : "hidden"}">
          <span>Opacity</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value="${opacityPercent}"
            data-imagery-opacity="${escapeHtml(key)}"
          />
          <strong data-imagery-opacity-value="${escapeHtml(key)}">${opacityPercent}%</strong>
        </label>
      </div>
    `;
  }).join("");

  return `
    <div class="imagery-panel-section">
      <div class="imagery-section-title">${escapeHtml(t("copernicusSourceImagery"))}</div>
      ${overlayMode}
      <div class="imagery-list">
        ${rows}
      </div>
    </div>
  `;
}

export function renderImageryComparisonPanel(info = state.latestSelectedProductInfo) {
  const panel = document.getElementById("source-imagery-panel");
  const body = document.getElementById("source-imagery-body");

  if (!panel || !body) {
    return;
  }

  const cogs = getSortedImageryItems(info);

  panel.classList.remove("hidden");
  panel.classList.remove("collapsed");

  body.innerHTML = `
    ${renderCopernicusSourceImagerySection(cogs)}
    ${renderSentinel1ComparisonSection()}
  `;

  updateImageryCompactStatus(info);
  updateImageryPanelButton();
  scheduleImageryAutoCompact();
}

function renderBasemapControlsLegendSection() {
  const satelliteActive = state.currentBasemap === "satellite";
  const streetActive = state.currentBasemap === "street";
  const labelsDisabled = state.currentBasemap !== "satellite";
  const labelsChecked = state.satelliteLabelsEnabled && !labelsDisabled;

  return renderLegendSection(
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

function renderAoiLegendSection() {
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

function renderProductLegendSections(info, product) {
  const productKey = getProductKey(product);

  return [
    renderCrisisLegendSection(productKey),
    renderDamageLegendSection(productKey, "builtUpP", t("builtUpPoints"), "point"),
    renderDamageLegendSection(productKey, "builtUpA", t("builtUpArea"), "area"),
    renderTransportLegendSection(productKey),
    renderNotAnalysedLegendSection(productKey),
    renderFacilitiesLegendSection(productKey),
    renderTransportationAreaLegendSection(productKey),
    renderGroundMovementLegendSection(productKey),
  ].filter(Boolean);
}

export function renderDynamicLegend(info = state.latestSelectedProductInfo) {
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
    renderBasemapControlsLegendSection(),
  ];

  products.forEach((product) => {
    const productSections = renderProductLegendSections(info, product);

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

  sections.push(renderAoiLegendSection());

  const cleanSections = sections.filter(Boolean);

  if (!cleanSections.length) {
    body.innerHTML = `<div class="map-legend-placeholder">${escapeHtml(t("noDisplayableLayers"))}</div>`;
  } else {
    body.innerHTML = cleanSections.join("");
  }

  renderImageryComparisonPanel(info);
  syncLayerToggleInputs();

  window.setTimeout(() => {
    syncActiveCogLayersForCurrentInfo(info);
  }, 0);
}

export function getStatusProgressNodes() {
  return {
    progress: document.getElementById("status-progress"),
    bar: document.getElementById("status-progress-bar"),
    label: document.getElementById("status-progress-label"),
  };
}

export function hideStatusProgress() {
  const { progress, bar, label } = getStatusProgressNodes();

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

export function showStatusProgress(percent = null, labelText = "") {
  const { progress, bar, label } = getStatusProgressNodes();

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

export function setStatus(type, title, message, showRetry) {
  if (!state.els.status || !state.els.statusTitle || !state.els.statusMessage || !state.els.retry) {
    return;
  }

  state.els.status.classList.remove("hidden", "loading", "success", "error");
  state.els.status.classList.add(type);

  state.els.statusTitle.textContent = title;
  state.els.statusMessage.textContent = message;
  state.els.retry.classList.toggle("hidden", !showRetry);

  hideStatusProgress();
}

export function maybeShowLargeLayerDownloadNotice(kind, url) {
  if (!isPotentiallyLargeCopernicusLayer(kind, url)) {
    return;
  }

  if (isJsonDocumentMemoryCached(url)) {
    return;
  }

  if (!state.els.status || !state.els.statusTitle || !state.els.statusMessage) {
    return;
  }

  setStatus(
    "loading",
    t("largeLayerLoadingTitle"),
    t("largeLayerLoadingText"),
    false
  );

  showStatusProgress(0, "0%");
}

export function syncMobileSidebarA11y() {
  const toggle = document.getElementById("sidebar-toggle");
  const closeButton = document.getElementById("sidebar-close");
  const isOpen = document.body.classList.contains("sidebar-open");

  if (toggle) {
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  if (closeButton) {
    closeButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }
}

export function closeMobileSidebar() {
  document.body.classList.remove("sidebar-open");
  syncMobileSidebarA11y();
}

export function installMobileSidebarCloseButton() {
  const closeButton = document.getElementById("sidebar-close");
  const toggle = document.getElementById("sidebar-toggle");

  if (closeButton && closeButton.dataset.bound !== "1") {
    closeButton.dataset.bound = "1";

    closeButton.addEventListener("click", () => {
      closeMobileSidebar();
    });
  }

  if (toggle && toggle.dataset.a11yBound !== "1") {
    toggle.dataset.a11yBound = "1";

    toggle.setAttribute("aria-controls", "sidebar");
    toggle.setAttribute("aria-expanded", document.body.classList.contains("sidebar-open") ? "true" : "false");

    toggle.addEventListener("click", () => {
      window.setTimeout(syncMobileSidebarA11y, 0);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      window.setTimeout(syncMobileSidebarA11y, 0);
    }
  });

  syncMobileSidebarA11y();
}
