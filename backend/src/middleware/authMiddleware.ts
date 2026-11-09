import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyAccessToken } from "../lib/authTokens.js";
import type { Env } from "../env.js";

export type AuthedRequest = Request & { user?: { id: string; email: string; role: Role } };

export function authMiddleware(env: Env) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }
    try {
      const token = header.slice("Bearer ".length);
      const u = verifyAccessToken(token, env.JWT_SECRET);
      req.user = { id: u.sub, email: u.email, role: u.role };
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };
}

export function requireRoles(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
