import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

export const journeyRouter = Router();

const COUNTRY: Record<string, string> = { AU: "Australia", CN: "China", SG: "Singapore", IN: "India", EG: "Egypt", NL: "Netherlands", NO: "Norway", GB: "United Kingdom", FI: "Finland", DE: "Germany", TW: "Taiwan", VN: "Vietnam", CD: "DR Congo", PL: "Poland", US: "United States", JP: "Japan", KR: "South Korea" };

/** Ordered, geo-referenced journey of a material from mine to end use (Chain Simulation page). */
journeyRouter.get("/", async (req, res) => {
  const slug = typeof req.query.material === "string" ? req.query.material : "gallium-nitride";
  const material = await prisma.material.findUnique({ where: { slug } });
  if (!material) throw notFound("Material");
  const steps = await prisma.journeyStep.findMany({ where: { materialSlug: slug }, orderBy: { order: "asc" } });
  const ids = [...new Set(steps.flatMap((s) => [s.fromEntityId, s.toEntityId]).filter((x): x is string => !!x))];
  const entities = await prisma.entity.findMany({
    where: { id: { in: ids } },
    include: { materials: { include: { material: { select: { slug: true, name: true, symbol: true } } } }, _count: { select: { incoming: true, outgoing: true } } },
  });
  const byId = new Map(entities.map((e) => [e.id, {
    id: e.id, slug: e.slug, name: e.name, type: e.type, typeLabel: e.typeLabel, description: e.description,
    region: e.region, country: e.country, countryName: e.country ? COUNTRY[e.country] ?? e.country : null,
    risk: e.risk, dependencyScore: e.dependencyScore, confidence: e.confidence, evidenceStatus: e.evidenceStatus, evidenceNote: e.evidenceNote,
    isChokepoint: e.isChokepoint, chokepointStatus: e.chokepointStatus, lat: e.lat, lng: e.lng,
    materials: e.materials.map((m) => ({ ...m.material, role: m.role })), connections: e._count.incoming + e._count.outgoing,
  }]));

  let day = 0, cost = 0;
  const out = steps.map((s) => {
    const from = s.fromEntityId ? byId.get(s.fromEntityId) ?? null : null;
    const to = s.toEntityId ? byId.get(s.toEntityId) ?? null : null;
    const waypoints: [number, number][] = s.waypoints ? JSON.parse(s.waypoints) : [];
    const path: [number, number][] = [];
    if (from?.lat != null && from.lng != null) path.push([from.lat, from.lng]);
    path.push(...waypoints);
    if (to?.lat != null && to.lng != null) path.push([to.lat, to.lng]);
    const dayStart = day; day += s.durationDays;
    cost += s.costUsd ?? 0;
    return { order: s.order, stage: s.stage, title: s.title, description: s.description, mode: s.mode, durationDays: s.durationDays, costUsd: s.costUsd ?? 0, cargo: s.cargo, carrier: s.carrier, dayStart, dayEnd: day, cumulativeCostUsd: Math.round(cost), from, to, path };
  });

  const all = out.flatMap((s) => s.path);
  const bounds = all.length ? { south: Math.min(...all.map((p) => p[0])), north: Math.max(...all.map((p) => p[0])), west: Math.min(...all.map((p) => p[1])), east: Math.max(...all.map((p) => p[1])) } : null;
  res.json({
    material: { slug: material.slug, name: material.name },
    steps: out,
    totalDays: day,
    totalCostUsd: Math.round(cost),
    countries: [...new Set(entities.map((e) => e.country).filter((c): c is string => !!c))].map((c) => ({ code: c, name: COUNTRY[c] ?? c })),
    bounds,
    attribution: "Map tiles: Esri, OpenStreetMap contributors. Route geometry, durations and costs are illustrative, not tracked shipments.",
  });
});
