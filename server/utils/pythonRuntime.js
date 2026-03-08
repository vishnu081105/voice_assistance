import fs from "node:fs";
import path from "node:path";

const WINDOWS_PYTHON_CANDIDATES = [
  [".venv312", "Scripts", "python.exe"],
  [".venv", "Scripts", "python.exe"],
  ["venv", "Scripts", "python.exe"],
];

const POSIX_PYTHON_CANDIDATES = [
  [".venv312", "bin", "python"],
  [".venv", "bin", "python"],
  ["venv", "bin", "python"],
];

function trimValue(value) {
  return String(value || "").trim();
}

export function resolvePythonBin(projectRoot, explicitValue = process.env.PYTHON_BIN) {
  const configured = trimValue(explicitValue);
  const genericCommands = new Set(["python", "python.exe", "py"]);

  if (configured && !genericCommands.has(configured.toLowerCase())) {
    return configured;
  }

  const candidates =
    process.platform === "win32" ? WINDOWS_PYTHON_CANDIDATES : POSIX_PYTHON_CANDIDATES;

  for (const segments of candidates) {
    const absolutePath = path.join(projectRoot, ...segments);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  if (configured) {
    return configured;
  }

  return process.platform === "win32" ? "python.exe" : "python";
}
