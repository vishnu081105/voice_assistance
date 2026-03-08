import jwt from "jsonwebtoken";
import { config } from "../config.js";

const JWT_SECRET = config.jwtSecret;
const AUTH_COOKIE_NAME = config.authCookieName;

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      full_name: user.full_name ?? null,
      role: user.role ?? "doctor",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme === "Bearer" && token) {
    return token;
  }
  return null;
}

function extractCookieToken(req) {
  if (req.signedCookies?.[AUTH_COOKIE_NAME]) {
    return String(req.signedCookies[AUTH_COOKIE_NAME]);
  }
  if (req.cookies?.[AUTH_COOKIE_NAME]) {
    return String(req.cookies[AUTH_COOKIE_NAME]);
  }
  return null;
}

function attachAuthFromToken(req, token) {
  const payload = jwt.verify(token, JWT_SECRET);
  req.auth = {
    userId: payload.sub,
    email: payload.email,
    fullName: payload.full_name ?? null,
    role: payload.role ?? "doctor",
    accessToken: token,
  };
}

export function setAuthCookie(res, accessToken) {
  res.cookie(AUTH_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    signed: true,
    maxAge: config.cookieMaxAgeMs,
    path: "/",
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    signed: true,
    path: "/",
  });
}

export function requireAuth(req, res, next) {
  const token = extractBearerToken(req) || extractCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    attachAuthFromToken(req, token);
    return next();
  } catch {
    return res.status(401).json({ error: "User not authenticated" });
  }
}

export function requireRole(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.auth?.userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}
