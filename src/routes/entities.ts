import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";
import { notFound } from "../lib/errors";

export const entitiesRouter = Router();

const byIdOrSlug = (idOrSlug: string) => ({ OR: [{ id: idOrSlug }, { slug: idOrSlug }] });

entitiesRouter.get("/", async (req, res) => {
  const q = parse(
    z.object({
      type: z.string().optional(),
      risk: z.enum(["low", "medium", "high"]).optional(),
      material: z.string().optional(),
      chokepoint: z.coerce.boolean().optional(),
      q: z.string().optional(),
    }),
    req.query,
  );
  const entities = await prisma.entity.findMany({
    where: {
      type: q.type,
      risk: q.risk,
      isChokepoint: q.chokepoint,
      name: q.q ? { contains: q.q } : undefined,
      materials: q.material ? { some: { material: { slug: q.material } } } : undefined,
    },
    orderBy: [{ dependencyScore: "desc" }],
    include: { materials: { include: { material: { select: { slug: true, name: true, symbol: true } } } }, _count: { select: { incoming: true, outgoing: true } } },
  });
  res.json({
    entities: entities.map((e) => ({
      ...e,
      materials: e.materials.map((m) => ({ ...m.material, role: m.role })),
      connections: e._count.incoming + e._count.outgoing,
      _count: undefined,
    })),
  });
});

/** Entity detail: the Explorer side panel and the map info card. */
entitiesRouter.get("/:id", async (req, res) => {
  const e = await prisma.entity.findFirst({
    where: byIdOrSlug(req.params.id),
    include: {
      materials: { include: { material: true } },
      outgoing: { include: { to: { select: { id: true, slug: true, name: true, typeLabel: true, risk: true } } } },
      incoming: { include: { from: { select: { id: true, slug: true, name: true, typeLabel: true, risk: true } } } },
      projects: { include: { project: true } },
      alerts: { where: { status: "open" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!e) throw notFound("Entity");
  res.json({
    entity: {
      ...e,
      materials: e.materials.map((m) => ({ ...m.material, role: m.role })),
      materialsLabel: e.materials.map((m) => m.material.symbol ?? m.material.name).join(" - "),
      connections: e.outgoing.length + e.incoming.length,
      connectionsLabel: `${e.outgoing.length + e.incoming.length} nodes`,
      dependencyScoreLabel: `${e.dependencyScore} / 100`,
      riskLabel: `${e.risk} risk`,
      projects: e.projects.map((p) => p.project),
    },
  });
});

/** Neighbourhood graph around an entity (depth-limited) for graph views. */
entitiesRouter.get("/:id/graph", async (req, res) => {
  const { depth } = parse(z.object({ depth: z.coerce.number().int().min(1).max(4).default(2) }), req.query);
  const root = await prisma.entity.findFirst({ where: byIdOrSlug(req.params.id), select: { id: true } });
  if (!root) throw notFound("Entity");
  const links = await prisma.link.findMany();
  const seen = new Set([root.id]);
  let frontier = [root.id];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const l of links) {
      if (frontier.includes(l.fromId) && !seen.has(l.toId)) { seen.add(l.toId); next.push(l.toId); }
      if (frontier.includes(l.toId) && !seen.has(l.fromId)) { seen.add(l.fromId); next.push(l.fromId); }
    }
    frontier = next;
  }
  const nodes = await prisma.entity.findMany({ where: { id: { in: [...seen] } }, select: { id: true, slug: true, name: true, type: true, typeLabel: true, risk: true, region: true, dependencyScore: true } });
  res.json({ rootId: root.id, nodes, edges: links.filter((l) => seen.has(l.fromId) && seen.has(l.toId)) });
});
