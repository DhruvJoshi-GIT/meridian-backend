import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

export const journeyRouter = Router();

/** Ordered, geo-referenced journey of a material from mine to end use (Chain Simulation page). */
journeyRouter.get("/", async (req, res) => {
  const slug = typeof req.query.material === "string" ? req.query.material : "gallium-nitride";
  const material = await prisma.material.findUnique({ where: { slug } });
  if (!material) throw notFound("Material");
  const steps = await prisma.journeyStep.findMany({ where: { materialSlug: slug }, orderBy: { order: "asc" } });
  const ids = [...new Set(steps.flatMap((s) => [s.fromEntityId, s.toEntityId]).filter((x): x is string => !!x))];
  const entities = await prisma.entity.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true, typeLabel: true, region: true, country: true, risk: true, lat: true, lng: true, isChokepoint: true } });
  const byId = new Map(entities.map((e) => [e.id, e]));

  const out = steps.map((s) => {
    const from = s.fromEntityId ? byId.get(s.fromEntityId) ?? null : null;
    const to = s.toEntityId ? byId.get(s.toEntityId) ?? null : null;
    const waypoints: [number, number][] = s.waypoints ? JSON.parse(s.waypoints) : [];
    const path: [number, number][] = [];
    if (from?.lat != null && from.lng != null) path.push([from.lat, from.lng]);
    path.push(...waypoints);
    if (to?.lat != null && to.lng != null) path.push([to.lat, to.lng]);
    return { order: s.order, stage: s.stage, title: s.title, description: s.description, mode: s.mode, durationDays: s.durationDays, from, to, path };
  });

  const all = out.flatMap((s) => s.path);
  const bounds = all.length ? { south: Math.min(...all.map((p) => p[0])), north: Math.max(...all.map((p) => p[0])), west: Math.min(...all.map((p) => p[1])), east: Math.max(...all.map((p) => p[1])) } : null;
  res.json({
    material: { slug: material.slug, name: material.name },
    steps: out,
    totalDays: out.reduce((s, x) => s + x.durationDays, 0),
    countries: [...new Set(entities.map((e) => e.country).filter(Boolean))],
    bounds,
    attribution: "Map tiles: Esri, OpenStreetMap contributors. Route geometry is illustrative; durations are typical, not tracked shipments.",
  });
});
