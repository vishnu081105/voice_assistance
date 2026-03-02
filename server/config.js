import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export const config = {
  projectRoot,
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:8080",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  sessionSecret: process.env.SESSION_SECRET || "dev-session-secret-change-me",
  uploadsDir: path.join(projectRoot, "server", "uploads"),
  aiGatewayUrl: process.env.AI_GATEWAY_URL || "https://ai.gateway.lovable.dev/v1/chat/completions",
  lovableApiKey: process.env.LOVABLE_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiApiUrl:
    process.env.GEMINI_API_URL ||
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
};
