import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { unauthorized } from "../lib/errors";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  title: string;
  initials: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

let demoUserCache: AuthUser | null = null;
async function demoUser(): Promise<AuthUser | null> {
  if (demoUserCache) return demoUserCache;
  const u = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!u) return null;
  demoUserCache = { id: u.id, email: u.email, name: u.name, title: u.title, initials: u.initials };
  return demoUserCache;
}

/**
 * Attaches req.user from a Bearer token. If AUTH_REQUIRED=false and no token is
 * present, the seeded demo analyst is used so the UI works without a login screen.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice(7);
      const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
      const u = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!u) throw unauthorized("User no longer exists");
      req.user = { id: u.id, email: u.email, name: u.name, title: u.title, initials: u.initials };
      return next();
    }
    if (!env.authRequired) {
      const d = await demoUser();
      if (d) req.user = d;
    }
    next();
  } catch (e) {
    next(e instanceof jwt.JsonWebTokenError ? unauthorized("Invalid or expired token") : e);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized("Authentication required"));
  next();
}
