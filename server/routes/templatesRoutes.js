import { Router } from "express";
import { templatesRepository } from "../lib/repositories/templatesRepository.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireFields } from "../middleware/validation.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const templates = await templatesRepository.listTemplatesForUser(req.auth.userId);
    return res.json({ data: templates, error: null });
  })
);

router.post(
  "/",
  requireFields(["name", "content"]),
  asyncHandler(async (req, res) => {
    const template = await templatesRepository.createTemplate({
      user_id: req.auth.userId,
      name: String(req.body.name),
      content: String(req.body.content),
      category: req.body.category ? String(req.body.category) : "General",
    });
    return res.status(201).json({ data: template, error: null });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await templatesRepository.deleteTemplateForUser(req.params.id, req.auth.userId);
    return res.json({ data: null, error: null });
  })
);

router.delete(
  "/",
  asyncHandler(async (req, res) => {
    await templatesRepository.deleteAllTemplatesForUser(req.auth.userId);
    return res.json({ data: null, error: null });
  })
);

export default router;

