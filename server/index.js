import "dotenv/config";
import fs from "node:fs";
import cors from "cors";
import express from "express";
import authRoutes from "./routes/authRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import templatesRoutes from "./routes/templatesRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import storageRoutes from "./routes/storageRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import patientsRoutes from "./routes/patientsRoutes.js";
import { sessionMiddleware } from "./middleware/session.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { config } from "./config.js";
import { ensureDatabaseSchema } from "./lib/db.js";

if (!fs.existsSync(config.uploadsDir)) {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
}

const app = express();

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/uploads", express.static(config.uploadsDir));
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/functions/v1", aiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  await ensureDatabaseSchema();
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
    console.log(`Uploads path: ${config.uploadsDir}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
