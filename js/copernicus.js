"use strict";

import {
  COPERNICUS_URL_OVERRIDES,
  PRODUCT_ALL_KEY,
} from "./config.js";

import {
  formatUtcDateLabel,
  latestIsoFromValues,
} from "./utils.js";

import { state } from "./state.js";

export function cleanOverrideUrls(overrides = COPERNICUS_URL_OVERRIDES) {
  const cleaned = {};

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "string" && value.trim().startsWith("http")) {
      cleaned[key] = value.trim();
    }
  }

  return cleaned;
}

export function getAllAois(manifest) {
  const aois = [];

  for (const result of manifest?.results || []) {
    if (Array.isArray(result.aois)) {
      aois.push(...result.aois);
    }
  }

  return aois.sort((a, b) => Number(a.number) - Number(b.number));
}

export function findAoiByNumber(manifest, aoiNumber) {
  const wanted = Number(aoiNumber);
  return getAllAois(manifest).find((aoi) => Number(aoi.number) === wanted) || null;
}

export function getProductLabel(product) {
  if (!product) {
    return "—";
  }

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

export function getProductKey(product) {
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

export function classifyLayer(text, ...values) {
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

export function extractLayerUrlsFromProduct(product) {
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

export function productLayerKeys(product) {
  return new Set(Object.keys(extractLayerUrlsFromProduct(product || {})));
}

export function productHasLayerKey(product, key) {
  return Boolean(extractLayerUrlsFromProduct(product || {})[key]);
}

export function productHasCogLayers(product) {
  return Array.isArray(product?.layers) && product.layers.some((layer) => {
    const name = String(layer?.name || "");
    return String(layer?.format || "").toLowerCase() === "cog" || /\.tif(f)?$/i.test(name);
  });
}

export function productHasVectorLayers(product) {
  return productLayerKeys(product).size > 0;
}

export function productHasUsefulLayers(product) {
  return productHasVectorLayers(product) || productHasCogLayers(product);
}

export function productStatusScore(product) {
  const status = product?.version?.statusCode || "";

  if (status === "F") return 1000;
  if (status === "I") return 160;
  if (status === "W") return 80;
  if (status === "N") return -500;

  return 0;
}

export function getProductTimeMillis(product) {
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

export function productTimeScore(product) {
  const millis = getProductTimeMillis(product);

  if (!Number.isFinite(millis)) {
    return 0;
  }

  return Math.min(250, Math.max(0, millis / 1e10 - 150));
}

export function scoreProductForLayerKey(product, key) {
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

export function scoreProductForCard(product) {
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

export function chooseBestProductForLayerKey(aoi, key) {
  const products = Array.isArray(aoi?.products) ? aoi.products : [];
  const candidates = products.filter((product) => productHasLayerKey(product, key));

  if (!candidates.length) {
    return null;
  }

  return candidates.sort(
    (a, b) => scoreProductForLayerKey(b, key) - scoreProductForLayerKey(a, key)
  )[0];
}

export function getUniqueProducts(products) {
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

export function choosePrimaryStatusProduct(products) {
  const unique = getUniqueProducts(products);

  if (!unique.length) {
    return null;
  }

  return unique.sort((a, b) => scoreProductForCard(b) - scoreProductForCard(a))[0];
}

export function getLatestAcquisitionTime(product) {
  const times = (product?.images || [])
    .map((image) => image.acquisitionTime)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (!times.length) {
    return "";
  }

  return new Date(Math.max(...times)).toISOString();
}

export function getLatestProductDeliveryTime(products) {
  return latestIsoFromValues(
    getUniqueProducts(products).map((product) => product?.version?.deliveryTime)
  );
}

export function getLatestProductExpectedDelivery(products) {
  return latestIsoFromValues(
    getUniqueProducts(products).map((product) => product?.expectedDelivery)
  );
}

export function getLatestAcquisitionTimeFromProducts(products) {
  const times = [];

  getUniqueProducts(products).forEach((product) => {
    const value = getLatestAcquisitionTime(product || {});

    if (value) {
      times.push(value);
    }
  });

  return latestIsoFromValues(times);
}

export function formatProductListLabel(products) {
  const unique = getUniqueProducts(products);

  if (!unique.length) {
    return "";
  }

  return unique.map(getProductLabel).join(" + ");
}

export function chooseAoiProduct(aoi) {
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

export function getProductsSortedForAoi(aoi) {
  const products = Array.isArray(aoi?.products) ? aoi.products.slice() : [];
  return products.sort((a, b) => scoreProductForCard(b) - scoreProductForCard(a));
}

export function parseSelectedProductKeys(products = []) {
  const list = Array.isArray(products) ? products : [];
  const useful = list.filter(productHasUsefulLayers);
  const raw = String(state.selectedProductKey || "").trim();

  if (raw === PRODUCT_ALL_KEY || raw.toLowerCase() === "all") {
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

export function selectedProductKeyString(keys = []) {
  return Array.from(new Set(keys.map((key) => String(key || "").trim()).filter(Boolean))).join(",");
}

export function getSelectedProductsForAoi(aoi, products = getProductsSortedForAoi(aoi)) {
  const list = Array.isArray(products) ? products : [];
  const selectedKeys = new Set(parseSelectedProductKeys(list));

  return list.filter((product) => selectedKeys.has(getProductKey(product)));
}

export function chooseSelectedProductForAoi(aoi, products = getProductsSortedForAoi(aoi)) {
  const selected = getSelectedProductsForAoi(aoi, products);

  if (selected.length) {
    return selected[0];
  }

  return products[0] || null;
}

export function getOfficialProductStatusCode(product) {
  return String(product?.version?.statusCode || "").toUpperCase();
}

export function getOfficialProductDotClass(product) {
  const status = getOfficialProductStatusCode(product);

  if (status === "F") {
    return "green";
  }

  if (status === "N") {
    return "red";
  }

  if (status === "W" || status === "I") {
    return "amber";
  }

  if (productHasVectorLayers(product)) {
    return "green";
  }

  return "amber";
}

export function formatProductSituationLabel(product) {
  const acquisition = getLatestAcquisitionTime(product || {});
  const time = acquisition || product?.version?.deliveryTime || product?.expectedDelivery || "";

  if (!time) {
    return "";
  }

  return formatUtcDateLabel(time);
}

export function getAwsBucketFromManifest(manifest) {
  return (
    manifest?.results?.[0]?.aws_bucket ||
    "https://rapidmapping-viewer.s3.eu-west-1.amazonaws.com"
  ).replace(/\/+$/, "");
}

export function resolveCopernicusAssetUrl(pathOrUrl, manifest) {
  const value = String(pathOrUrl || "").trim();

  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${getAwsBucketFromManifest(manifest)}/${value.replace(/^\/+/, "")}`;
}

export function matchImageForCogLayer(product, layer, fallbackIndex = 0) {
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

export function formatImageLayerLabel(image, layer) {
  const sensor = image?.sensorName || image?.sensorType || "Source image";
  const time = image?.acquisitionTime ? formatUtcDateLabel(image.acquisitionTime) : "";

  if (time) {
    return `${sensor} - ${time}`;
  }

  const name = String(layer?.name || image?.fileName || "").split("/").pop() || sensor;
  return name.replace(/_cog\.tif$/i, ".tif");
}

export function extractCogLayersFromProduct(product, manifest) {
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
