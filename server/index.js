import "dotenv/config";
import fs from "node:fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import sttRoutes from "./routes/sttRoutes.js";
import templatesRoutes from "./routes/templatesRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import storageRoutes from "./routes/storageRoutes.js";
import audioRoutes from "./routes/audioRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import patientsRoutes from "./routes/patientsRoutes.js";
import medicalRoutes from "./routes/medicalRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { config } from "./config.js";
import { ensureDatabaseSchema } from "./lib/db.js";
import { ensurePrivateStorageDirectories } from "./services/privateFileService.js";
import { sttServiceManager } from "./services/sttServiceManager.js";
import { transcriptionQueue } from "./services/transcriptionQueue.js";
import { logger } from "./utils/logger.js";

if (!fs.existsSync(config.privateRootDir)) {
  fs.mkdirSync(config.privateRootDir, { recursive: true });
}
ensurePrivateStorageDirectories();

const app = express();

if (config.trustedProxy) {
  app.set("trust proxy", 1);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "connect-src": ["'self'", config.clientOrigin],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "blob:"],
        "object-src": ["'none'"],
        "frame-ancestors": ["'none'"],
      },
    },
    frameguard: { action: "deny" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(cookieParser(config.sessionSecret));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/", sttRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/medical", medicalRoutes);
app.use("/api", aiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  await ensureDatabaseSchema();
  if (config.sttAutoStart) {
    await sttServiceManager.ensureRunning().catch(() => false);
  }
  const sttHealth = await transcriptionQueue.checkHealth().catch(() => null);

  app.listen(config.port, () => {
    logger.info("Server started", {
      port: config.port,
      client_origin: config.clientOrigin,
      stt_service_url: config.sttServiceUrl,
      stt_available: Boolean(sttHealth?.ok),
      private_root_dir: config.privateRootDir,
    });
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start server", {
    error_message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
