import { Router } from "express";
import { config } from "../config.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { transcriptionQueue } from "../services/transcriptionQueue.js";

const router = Router();

router.get(
  "/stt/health",
  asyncHandler(async (_req, res) => {
    const health = await transcriptionQueue.checkHealth({ force: true });
    const snapshot = transcriptionQueue.getSnapshot();
    const serviceDetails = health?.details && typeof health.details === "object" ? health.details : {};

    return res.status(health.ok ? 200 : 503).json({
      ok: health.ok,
      model: serviceDetails.model || config.whisperModel,
      device: serviceDetails.device || config.whisperDevice,
      compute_type: serviceDetails.compute_type || config.whisperComputeType,
      ...snapshot,
      service: serviceDetails,
    });
  })
);

export default router;
