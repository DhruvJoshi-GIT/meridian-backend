import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";
import { signToken, requireAuth } from "../middleware/auth";
import { unauthorized, badRequest } from "../lib/errors";

export const authRouter = Router();

const credentials = z.object({ email: z.email(), password: z.string().min(6) });

authRouter.post("/login", async (req, res) => {
  const { email, password } = parse(credentials, req.body);
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw unauthorized("Invalid email or password");
  const user = { id: u.id, email: u.email, name: u.name, title: u.title, initials: u.initials };
  res.json({ token: signToken(user), user });
});

authRouter.post("/register", async (req, res) => {
  const body = parse(credentials.extend({ name: z.string().min(1), title: z.string().optional() }), req.body);
  const exists = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (exists) throw badRequest("Email already registered");
  const initials = body.name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").join("").slice(0, 2);
  const u = await prisma.user.create({
    data: { email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(body.password, 10), name: body.name, title: body.title ?? "Analyst", initials },
  });
  const user = { id: u.id, email: u.email, name: u.name, title: u.title, initials: u.initials };
  res.status(201).json({ token: signToken(user), user });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
