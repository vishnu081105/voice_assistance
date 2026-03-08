import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isHealthy() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.sttHealthTimeoutMs);

  try {
    const response = await fetch(`${config.sttServiceUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) return false;

    const payload = await response.json().catch(() => ({}));
    return payload?.ok !== false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

class SttServiceManager {
  constructor() {
    this.child = null;
    this.startPromise = null;
    this.exitHandlersRegistered = false;
  }

  async ensureRunning() {
    if (!config.sttAutoStart) {
      return isHealthy();
    }

    if (await isHealthy()) {
      return true;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startLocalService()
      .catch((error) => {
        logger.warn("stt.autostart_failed", {
          error_message: error instanceof Error ? error.message : String(error),
        });
        return false;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  async startLocalService() {
    if (this.child && !this.child.killed) {
      return this.waitForHealthy();
    }

    const sttEntrypoint = path.join(config.projectRoot, "stt_service", "server.py");
    const child = spawn(config.pythonBin, [sttEntrypoint], {
      cwd: config.projectRoot,
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        STT_PORT: String(new URL(config.sttServiceUrl).port || 9000),
      },
    });

    this.child = child;
    this.registerExitHandlers();

    child.on("exit", (code, signal) => {
      logger.warn("stt.process_exit", {
        code,
        signal,
      });
      if (this.child === child) {
        this.child = null;
      }
    });

    child.on("error", (error) => {
      logger.warn("stt.process_error", {
        error_message: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info("stt.autostart_spawned", {
      python_bin: config.pythonBin,
      service_url: config.sttServiceUrl,
    });

    return this.waitForHealthy();
  }

  async waitForHealthy() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < config.sttStartupTimeoutMs) {
      if (await isHealthy()) {
        return true;
      }
      await sleep(1000);
    }
    return false;
  }

  registerExitHandlers() {
    if (this.exitHandlersRegistered) return;
    this.exitHandlersRegistered = true;

    const cleanup = () => {
      if (this.child && !this.child.killed) {
        this.child.kill();
      }
    };

    process.once("exit", cleanup);
    process.once("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.once("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  }
}

const globalForSttServiceManager = globalThis;

export const sttServiceManager =
  globalForSttServiceManager.__sttServiceManager || new SttServiceManager();

if (process.env.NODE_ENV !== "production") {
  globalForSttServiceManager.__sttServiceManager = sttServiceManager;
}
