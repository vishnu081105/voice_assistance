export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, _req, res, _next) {
  console.error(err);
  const message =
    typeof err?.message === "string" && err.message.trim()
      ? err.message
      : "Internal server error";
  const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  res.status(statusCode).json({ error: message });
}

