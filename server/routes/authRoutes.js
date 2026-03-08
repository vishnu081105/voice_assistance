import bcrypt from "bcryptjs";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { usersRepository } from "../lib/repositories/usersRepository.js";
import { toPublicUser, toSession } from "../lib/authSession.js";
import { clearAuthCookie, requireAuth, setAuthCookie, signAccessToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authRateLimiter } from "../middleware/rateLimit.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { auditLogService } from "../services/auditLogService.js";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updatePasswordSchema,
} from "../validators/authValidators.js";
import { config } from "../config.js";

const router = Router();

function validatePasswordStrength(password) {
  if (typeof password !== "string" || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

function validateResetPassword(password) {
  return typeof password === "string" && password.length >= 6;
}

router.post(
  "/signup",
  validateRequest({ body: signupSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, full_name: fullName } = req.validatedBody;

    if (!validatePasswordStrength(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
      });
    }

    const existing = await usersRepository.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "User already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await usersRepository.createUser({
      email,
      fullName,
      passwordHash,
      role: "doctor",
    });

    return res.json({
      user: toPublicUser(user),
      session: null,
    });
  })
);

router.post(
  "/login",
  authRateLimiter,
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.validatedBody;

    const user = await usersRepository.findByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    const accessToken = signAccessToken(user);
    setAuthCookie(res, accessToken);
    await auditLogService.log(req, {
      action: "login",
      resourceType: "user",
      resourceId: user.id,
      userId: user.id,
    });

    return res.json({
      user: toPublicUser(user),
      session: toSession(user),
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await usersRepository.findById(req.auth.userId);
    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    return res.json({ user: toPublicUser(user), session: toSession(user) });
  })
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await auditLogService.log(req, {
      action: "logout",
      resourceType: "user",
      resourceId: req.auth.userId,
    });
    clearAuthCookie(res);
    return res.json({ success: true });
  })
);

router.post(
  "/forgot-password",
  validateRequest({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { email, redirectTo } = req.validatedBody;

    const user = await usersRepository.findByEmail(email);
    if (!user) {
      return res.json({ success: true });
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await usersRepository.setResetToken({ email, token, expiresAt });

    const link = redirectTo ? `${redirectTo}?token=${encodeURIComponent(token)}` : token;
    const response = { success: true };
    if (!config.isProduction) {
      response.debug_reset_link = link;
    }

    return res.json(response);
  })
);

router.post(
  "/reset-password",
  validateRequest({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { token, password } = req.validatedBody;

    if (!validateResetPassword(password)) {
      return res.status(400).json({
        error: "Password must be at least 6 characters.",
      });
    }

    const user = await usersRepository.findByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await usersRepository.updatePassword(user.id, passwordHash);

    return res.json({ success: true });
  })
);

router.post(
  "/update-password",
  requireAuth,
  validateRequest({ body: updatePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { password } = req.validatedBody;
    if (!validateResetPassword(password)) {
      return res.status(400).json({
        error: "Password must be at least 6 characters.",
      });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await usersRepository.updatePassword(req.auth.userId, passwordHash);
    return res.json({ success: true });
  })
);

export default router;
