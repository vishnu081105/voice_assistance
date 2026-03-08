import { config } from "../config.js";

export const audioEnhancementService = {
  getNoiseReductionFilter() {
    if (!config.audioNoiseReductionEnabled) {
      return "";
    }

    return String(config.audioNoiseReductionFilter || "").trim();
  },
};
