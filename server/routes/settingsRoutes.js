import { Router } from "express";
import { settingsRepository } from "../lib/repositories/settingsRepository.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireFields } from "../middleware/validation.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/:key",
  asyncHandler(async (req, res) => {
    const setting = await settingsRepository.getSetting(req.auth.userId, String(req.params.key));
    if (!setting) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }
    return res.json({ data: setting, error: null });
  })
);

router.put(
  "/:key",
  requireFields(["value"]),
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    const setting = await settingsRepository.upsertSetting(req.auth.userId, key, req.body.value);
    return res.json({ data: setting, error: null });
  })
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    await settingsRepository.deleteAllSettingsForUser(req.auth.userId);
    return res.json({ data: null, error: null });
  })
);

export default router;

