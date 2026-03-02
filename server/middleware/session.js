import session from "express-session";
import { config } from "../config.js";

export const sessionMiddleware = session({
  name: "medivoice.sid",
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

