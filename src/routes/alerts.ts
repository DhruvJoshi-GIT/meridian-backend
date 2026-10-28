import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";
import { relativeTime } from "../lib/time";
import { notFound } from "../lib/errors";

export const alertsRouter = Router();

alertsRouter.get("/", async (req, res) => {
  const q = parse(z.object({ status: z.enum(["open", "acknowledged", "resolved"]).optional(), level: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
  const alerts = await prisma.alert.findMany({ where: { status: q.status, level: q.level }, orderBy: { createdAt: "desc" }, take: q.limit, include: { entity: { select: { id: true, slug: true, name: true } } } });
  const now = new Date();
  res.json({ alerts: alerts.map((a) => ({ ...a, time: relativeTime(a.createdAt, now) })), unread: await prisma.alert.count({ where: { status: "open" } }) });
});

alertsRouter.get("/:id", async (req, res) => {
  const a = await prisma.alert.findUnique({ where: { id: req.params.id }, include: { entity: true } });
  if (!a) throw notFound("Alert");
  res.json({ alert: { ...a, time: relativeTime(a.createdAt) } });
});

alertsRouter.patch("/:id", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["open", "acknowledged", "resolved"]) }), req.body);
  const a = await prisma.alert.update({ where: { id: req.params.id }, data: { status } });
  res.json({ alert: a });
});
