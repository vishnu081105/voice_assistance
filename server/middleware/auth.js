import jwt from "jsonwebtoken";
import { config } from "../config.js";

const JWT_SECRET = config.jwtSecret;

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      full_name: user.full_name ?? null,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      fullName: payload.full_name ?? null,
      accessToken: token,
    };
    return next();
  } catch {
    return res.status(401).json({ error: "User not authenticated" });
  }
}
