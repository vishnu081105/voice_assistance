import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

const router = Router();

if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (req, file, cb) => {
    const reportId = String(req.body.reportId || "report");
    const safeExt = path.extname(file.originalname || ".webm").replace(/[^a-zA-Z0-9.]/g, "");
    cb(null, `${req.auth.userId}-${reportId}-${Date.now()}${safeExt || ".webm"}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("audio/")) {
      cb(new Error("Only audio files are allowed"));
      return;
    }
    cb(null, true);
  },
});

router.post(
  "/recordings",
  requireAuth,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ data: null, error: { message: "No file uploaded" } });
    }
    const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
    return res.json({
      data: {
        path: req.file.filename,
        publicUrl,
      },
      error: null,
    });
  })
);

export default router;

