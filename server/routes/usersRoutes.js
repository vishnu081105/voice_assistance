import { Router } from "express";
import { usersRepository } from "../lib/repositories/usersRepository.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { auditLogService } from "../services/auditLogService.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const limit =
      typeof req.query.limit === "string" && Number(req.query.limit) > 0
        ? Number(req.query.limit)
        : 100;
    const users = await usersRepository.listUsers(limit);
    await auditLogService.log(req, {
      action: "view_users",
      resourceType: "user_collection",
      resourceId: null,
    });
    return res.json({ data: users, error: null });
  })
);

router.put(
  "/me",
  asyncHandler(async (req, res) => {
    const current = await usersRepository.findById(req.auth.userId);
    if (!current) {
      return res.status(404).json({ data: null, error: { message: "No rows found" } });
    }
    const next = await usersRepository.upsertProfile({
      id: current.id,
      email: req.body.email ?? current.email,
      fullName: req.body.full_name ?? current.full_name,
    });
    return res.json({
      data: {
        id: next.id,
        email: next.email,
        full_name: next.full_name,
        created_at: next.created_at,
        updated_at: next.updated_at,
      },
      error: null,
    });
  })
);

export default router;
