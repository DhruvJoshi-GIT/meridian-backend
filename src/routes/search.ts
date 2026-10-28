import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";

export const searchRouter = Router();

const PAGES = ["Overview", "Supply Chain Explorer", "Global Map", "Dependency Analysis", "Disruption Simulator", "Tariff Intelligence", "Alternative Sources", "Reports"];

/** Unified search across materials, entities, reports and pages. */
searchRouter.get("/", async (req, res) => {
  const { q, limit } = parse(z.object({ q: z.string().trim().default(""), limit: z.coerce.number().int().min(1).max(50).default(10) }), req.query);
  if (!q) return res.json({ query: q, results: [], suggestions: ["Gallium", "Gallium Nitride (GaN)", "Strait of Malacca"] });

  const [materials, entities, reports] = await Promise.all([
    prisma.material.findMany({ where: { OR: [{ name: { contains: q } }, { symbol: { contains: q } }, { slug: { contains: q } }] }, take: limit, include: { _count: { select: { entities: true } } } }),
    prisma.entity.findMany({ where: { OR: [{ name: { contains: q } }, { region: { contains: q } }, { country: { contains: q } }, { typeLabel: { contains: q } }] }, take: limit, include: { _count: { select: { incoming: true, outgoing: true } } } }),
    prisma.report.findMany({ where: { title: { contains: q } }, take: limit, select: { id: true, title: true, type: true, createdAt: true } }),
  ]);

  const results = [
    ...materials.map((m) => ({ kind: "material", id: m.id, slug: m.slug, title: m.name, subtitle: `${m.category} - ${m._count.entities} connected entities`, page: "Supply Chain Explorer" })),
    ...entities.map((e) => ({ kind: "entity", id: e.id, slug: e.slug, title: e.name, subtitle: `${e.typeLabel} - ${e.region ?? ""} - ${e._count.incoming + e._count.outgoing} connections`, page: "Supply Chain Explorer" })),
    ...reports.map((r) => ({ kind: "report", id: r.id, title: r.title, subtitle: `${r.type} - ${r.createdAt.toDateString()}`, page: "Reports" })),
    ...PAGES.filter((p) => p.toLowerCase().includes(q.toLowerCase())).map((p) => ({ kind: "page", id: p, title: p, subtitle: "Open workspace", page: p })),
  ].slice(0, limit);

  if (req.user && results.length) {
    await prisma.activity.create({ data: { userId: req.user.id, type: "search", title: q } }).catch(() => undefined);
  }

  res.json({ query: q, results });
});
