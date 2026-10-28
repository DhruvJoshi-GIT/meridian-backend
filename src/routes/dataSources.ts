import { Router } from "express";
import { prisma } from "../lib/prisma";
import { relativeTime } from "../lib/time";

export const dataSourcesRouter = Router();

dataSourcesRouter.get("/", async (_req, res) => {
  const sources = await prisma.dataSource.findMany({ orderBy: { lastUpdatedAt: "desc" } });
  const now = new Date();
  res.json({
    sources: sources.map((s) => ({ ...s, lastUpdatedLabel: relativeTime(s.lastUpdatedAt, now) })),
    dataUpdatedAt: sources[0]?.lastUpdatedAt ?? null,
  });
});
