import { Router } from "express";
import { prisma } from "../lib/prisma";

export const mapRouter = Router();

/** Nodes + routes for the Global Map and the Overview map card. */
mapRouter.get("/", async (req, res) => {
  const material = typeof req.query.material === "string" ? req.query.material : undefined;
  const [nodes, routes, layers] = await Promise.all([
    prisma.entity.findMany({
      where: { mapX: { not: null }, materials: material ? { some: { material: { slug: material } } } : undefined },
      select: { id: true, slug: true, name: true, type: true, typeLabel: true, risk: true, mapX: true, mapY: true, lat: true, lng: true, isChokepoint: true, chokepointStatus: true, confidence: true },
    }),
    prisma.link.findMany({
      where: material ? { materialSlug: material } : undefined,
      include: { from: { select: { id: true, slug: true, mapX: true, mapY: true } }, to: { select: { id: true, slug: true, mapX: true, mapY: true } } },
    }),
    prisma.material.findMany({ select: { slug: true, name: true } }),
  ]);
  res.json({
    nodes,
    routes: routes.map((r) => ({ id: r.id, fromId: r.fromId, toId: r.toId, kind: r.kind, corridor: r.corridor, risk: r.risk, volumeShare: r.volumeShare, material: r.materialSlug, from: r.from, to: r.to })),
    layers: [{ key: "all", label: "All flows" }, ...layers.map((l) => ({ key: l.slug, label: l.name }))],
    legend: [{ key: "low", label: "Low" }, { key: "medium", label: "Moderate" }, { key: "high", label: "High risk" }],
  });
});
