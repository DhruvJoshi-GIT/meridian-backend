import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

export const materialsRouter = Router();

materialsRouter.get("/", async (_req, res) => {
  const materials = await prisma.material.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { entities: true, supplyChains: true } } } });
  res.json({ materials: materials.map((m) => ({ ...m, connectedEntities: m._count.entities, supplyChains: m._count.supplyChains, _count: undefined })) });
});

materialsRouter.get("/:idOrSlug", async (req, res) => {
  const m = await prisma.material.findFirst({
    where: { OR: [{ id: req.params.idOrSlug }, { slug: req.params.idOrSlug }] },
    include: {
      entities: { include: { entity: { select: { id: true, slug: true, name: true, typeLabel: true, risk: true, region: true, dependencyScore: true } } } },
      supplyChains: { select: { id: true, name: true } },
      assessments: { select: { id: true, title: true, hhi: true, concentration: true } },
      alternatives: true,
    },
  });
  if (!m) throw notFound("Material");
  res.json({ material: { ...m, entities: m.entities.map((e) => ({ ...e.entity, role: e.role })) } });
});
