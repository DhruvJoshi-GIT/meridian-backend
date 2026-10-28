import { Router } from "express";
import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

export const supplyChainsRouter = Router();

const stageInclude = {
  stages: { orderBy: { order: "asc" as const }, include: { entity: { select: { id: true, slug: true, name: true, type: true, typeLabel: true, region: true, risk: true, dependencyScore: true } } } },
  material: { select: { id: true, slug: true, name: true, symbol: true } },
};

supplyChainsRouter.get("/", async (req, res) => {
  const material = typeof req.query.material === "string" ? req.query.material : undefined;
  const chains = await prisma.supplyChain.findMany({ where: material ? { material: { slug: material } } : undefined, include: stageInclude });
  res.json({ chains: chains.map(shape) });
});

supplyChainsRouter.get("/:id", async (req, res) => {
  const chain = await prisma.supplyChain.findUnique({ where: { id: req.params.id }, include: stageInclude });
  if (!chain) throw notFound("Supply chain");
  res.json({ chain: shape(chain) });
});

function shape(c: { id: string; name: string; note: string | null; material: unknown; stages: { order: number; stage: string; entity: { region: string | null } & Record<string, unknown> }[] }) {
  return {
    id: c.id,
    name: c.name,
    note: c.note,
    material: c.material,
    stages: c.stages.map((s) => ({ order: s.order, stage: s.stage, detail: s.entity.region, ...s.entity })),
  };
}
