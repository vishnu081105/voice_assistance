import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePythonBin } from "../server/utils/pythonRuntime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const pythonBin = resolvePythonBin(projectRoot);
const entrypoint = path.join(projectRoot, "stt_service", "server.py");

const child = spawn(pythonBin, [entrypoint], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
  windowsHide: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Failed to start STT service with "${pythonBin}": ${error.message}`);
  process.exit(1);
});
