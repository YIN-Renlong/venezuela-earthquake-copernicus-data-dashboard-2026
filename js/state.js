"use strict";

import { DEFAULT_AOI_NUMBER } from "./config.js";

export const state = {
  currentLang: "es",
  currentBasemap: "satellite",
  satelliteLabelsEnabled: true,
  imageryOverlayMode: false,

  map: null,
  mapReady: false,
  isLoading: false,

  selectedAoiNumber: DEFAULT_AOI_NUMBER,
  selectedProductKey: "",

  latestAois: [],
  currentProductOptions: [],
  latestDataStatusMeta: {},
  latestSelectedProductInfo: null,

  loadedSourceMeta: {},
  dynamicDataLayerIds: new Set(),
  dynamicSourceIds: new Set(),

  els: {},

  layerVisibility: {
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

    aoi: true,

    transportHighway: true,
    transportMain: true,
    transportLocal: true,
    transportTrack: true,
    transportAirfieldRunway: true,
    transportRailway: true,
  },
};

export function getLayerVisibility(key, defaultValue = true) {
  if (!Object.prototype.hasOwnProperty.call(state.layerVisibility, key)) {
    state.layerVisibility[key] = defaultValue !== false;
  }

  return state.layerVisibility[key] !== false;
}

export function setLayerVisibilityState(key, value) {
  state.layerVisibility[key] = Boolean(value);
}
