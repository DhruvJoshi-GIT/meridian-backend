import { Router } from "express";
import { prisma } from "../lib/prisma";
import { relativeTime } from "../lib/time";

export const overviewRouter = Router();

async function metrics() {
  const monthAgo = new Date(Date.now() - 30 * 86400_000);
  const [materialsTracked, materialsAdded, highRisk, highRiskReview, chokepoints, chokepointsElevated, projectsExposed, programmes] =
    await Promise.all([
      prisma.material.count(),
      prisma.material.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.entity.count({ where: { risk: "high" } }),
      prisma.entity.count({ where: { risk: "high", evidenceStatus: { in: ["Inferred", "Estimated"] } } }),
      prisma.entity.count({ where: { isChokepoint: true } }),
      prisma.entity.count({ where: { isChokepoint: true, chokepointStatus: "elevated" } }),
      prisma.project.count({ where: { exposure: { in: ["medium", "high"] } } }),
      prisma.project.findMany({ select: { programme: true }, distinct: ["programme"] }),
    ]);
  return [
    { key: "materials", label: "Materials tracked", value: materialsTracked, sub: `${materialsAdded} added this month`, tone: "blue", page: "Supply Chain Explorer" },
    { key: "highRisk", label: "High-risk dependencies", value: highRisk, sub: `${highRiskReview} require review`, tone: "red", page: "Dependency Analysis" },
    { key: "chokepoints", label: "Critical chokepoints", value: chokepoints, sub: `${chokepointsElevated} elevated`, tone: "amber", page: "Global Map" },
    { key: "projects", label: "Projects potentially exposed", value: projectsExposed, sub: `Across ${programmes.length} programmes`, tone: "teal", page: "Dependency Analysis" },
  ];
}

overviewRouter.get("/metrics", async (_req, res) => {
  res.json({ metrics: await metrics(), note: "Illustrative data" });
});

/** Everything the Overview page needs in one call. */
overviewRouter.get("/overview", async (req, res) => {
  const now = new Date();
  const [m, alerts, activity, nodes, freshest] = await Promise.all([
    metrics(),
    prisma.alert.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" }, take: 3, include: { entity: { select: { id: true, slug: true, name: true } } } }),
    req.user
      ? prisma.activity.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 3 })
      : Promise.resolve([]),
    prisma.entity.findMany({ where: { mapX: { not: null } }, select: { id: true, slug: true, name: true, typeLabel: true, risk: true, mapX: true, mapY: true, lat: true, lng: true } }),
    prisma.dataSource.findFirst({ orderBy: { lastUpdatedAt: "desc" }, select: { lastUpdatedAt: true } }),
  ]);

  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  res.json({
    greeting: `${greeting}, ${req.user?.name.split(" ")[0] ?? "Analyst"}.`,
    date: now.toISOString(),
    dataUpdatedAt: freshest?.lastUpdatedAt ?? null,
    dataUpdatedLabel: freshest ? `Data updated ${relativeTime(freshest.lastUpdatedAt, now)}` : "Data freshness unknown",
    metrics: m,
    alerts: alerts.map((a) => ({ ...a, time: relativeTime(a.createdAt, now) })),
    recentActivity: activity.map((a) => ({ ...a, time: relativeTime(a.createdAt, now), label: `${capitalize(a.type)} - ${relativeTime(a.createdAt, now)}` })),
    mapNodes: nodes,
  });
});

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
