import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";
import { relativeTime } from "../lib/time";
import { requireAuth } from "../middleware/auth";

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get("/", async (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }), req.query);
  const items = await prisma.activity.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: limit });
  const now = new Date();
  res.json({ activity: items.map((a) => ({ ...a, time: relativeTime(a.createdAt, now) })) });
});

activityRouter.post("/", async (req, res) => {
  const body = parse(z.object({ type: z.enum(["search", "simulation", "report", "view"]), title: z.string().min(1), refType: z.string().optional(), refId: z.string().optional() }), req.body);
  const a = await prisma.activity.create({ data: { ...body, userId: req.user!.id } });
  res.status(201).json({ activity: a });
});
