export function requireFields(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      const value = req.body?.[field];
      if (value === undefined || value === null || String(value).trim() === "") {
        return res.status(400).json({ error: `${field} is required` });
      }
    }
    return next();
  };
}

export function normalizeEmail(req, _res, next) {
  if (typeof req.body?.email === "string") {
    req.body.email = req.body.email.trim().toLowerCase();
  }
  next();
}

