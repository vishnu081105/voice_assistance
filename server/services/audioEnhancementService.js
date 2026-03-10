import { config } from "../config.js";

function buildFilterChain(filters) {
  return filters
    .map((filter) => String(filter || "").trim())
    .filter(Boolean)
    .join(",");
}

export const audioEnhancementService = {
  getNoiseReductionFilter() {
    if (!config.audioNoiseReductionEnabled) {
      return "";
    }

    return String(config.audioNoiseReductionFilter || "").trim();
  },

  getVolumeNormalizationFilter() {
    if (!config.audioVolumeNormalizationEnabled) {
      return "";
    }

    return String(config.audioVolumeNormalizationFilter || "").trim();
  },

  getTranscriptionFilterChain() {
    return buildFilterChain([this.getNoiseReductionFilter(), this.getVolumeNormalizationFilter()]);
  },
};
