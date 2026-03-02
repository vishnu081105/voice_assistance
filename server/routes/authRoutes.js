import bcrypt from "bcryptjs";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { usersRepository } from "../lib/repositories/usersRepository.js";
import { toPublicUser, toSession } from "../lib/authSession.js";
import { requireAuth, signAccessToken } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { normalizeEmail, requireFields } from "../middleware/validation.js";

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
  normalizeEmail,
  requireFields(["email", "password"]),
  asyncHandler(async (req, res) => {
    const email = String(req.body.email);
    const password = String(req.body.password);
    const fullName =
      typeof req.body.full_name === "string" && req.body.full_name.trim()
        ? req.body.full_name.trim()
        : null;

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
    });

    return res.json({
      user: toPublicUser(user),
      session: null,
    });
  })
);

router.post(
  "/login",
  normalizeEmail,
  requireFields(["email", "password"]),
  asyncHandler(async (req, res) => {
    const email = String(req.body.email);
    const password = String(req.body.password);

    const user = await usersRepository.findByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: "Invalid login credentials" });
    }

    const accessToken = signAccessToken(user);
    req.session.userId = user.id;
    req.session.accessToken = accessToken;

    return res.json({
      user: toPublicUser(user),
      session: toSession(user, accessToken),
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
    return res.json({ user: toPublicUser(user), session: toSession(user, req.auth.accessToken) });
  })
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await new Promise((resolve) => req.session.destroy(resolve));
    res.clearCookie("medivoice.sid");
    return res.json({ success: true });
  })
);

router.post(
  "/forgot-password",
  normalizeEmail,
  requireFields(["email"]),
  asyncHandler(async (req, res) => {
    const email = String(req.body.email);
    const redirectTo =
      typeof req.body.redirectTo === "string" && req.body.redirectTo.trim()
        ? req.body.redirectTo.trim()
        : "";

    const user = await usersRepository.findByEmail(email);
    if (!user) {
      return res.json({ success: true });
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await usersRepository.setResetToken({ email, token, expiresAt });

    const link = redirectTo ? `${redirectTo}?token=${encodeURIComponent(token)}` : token;
    console.info(`[password-reset] email=${email} resetLink=${link}`);

    return res.json({ success: true });
  })
);

router.post(
  "/reset-password",
  requireFields(["token", "password"]),
  asyncHandler(async (req, res) => {
    const token = String(req.body.token);
    const password = String(req.body.password);

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
  requireFields(["password"]),
  asyncHandler(async (req, res) => {
    const password = String(req.body.password);
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
