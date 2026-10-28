import { Router } from "express";
import { prisma } from "../lib/prisma";
import { computeConcentration } from "../services/dependency";
import { notFound } from "../lib/errors";

export const dependencyRouter = Router();

/** Dependency Analysis page: curated assessment + live concentration computed from link shares. */
dependencyRouter.get("/", async (req, res) => {
  const slug = typeof req.query.material === "string" ? req.query.material : "gallium-nitride";
  const material = await prisma.material.findUnique({ where: { slug } });
  if (!material) throw notFound("Material");

  const [assessment, live] = await Promise.all([
    prisma.dependencyAssessment.findFirst({
      where: { materialId: material.id },
      orderBy: { updatedAt: "desc" },
      include: { items: { orderBy: { rank: "asc" }, include: { entity: { select: { id: true, slug: true, name: true, typeLabel: true, risk: true, region: true } } } } },
    }),
    computeConcentration(slug),
  ]);

  res.json({
    material: { id: material.id, slug: material.slug, name: material.name },
    assessment: assessment
      ? {
          id: assessment.id,
          title: assessment.title,
          hhi: assessment.hhi,
          concentration: assessment.concentration,
          summary: assessment.summary,
          updatedAt: assessment.updatedAt,
          items: assessment.items.map((i) => ({ rank: i.rank, score: i.score, rating: i.rating, note: i.note, ...i.entity })),
        }
      : null,
    live,
    headline: `Supplier concentration - HHI ${(assessment?.hhi ?? live.hhi).toLocaleString()} - ${assessment?.concentration ?? live.concentration} concentration`,
  });
});

dependencyRouter.get("/assessments", async (_req, res) => {
  const list = await prisma.dependencyAssessment.findMany({ include: { material: { select: { slug: true, name: true } } }, orderBy: { updatedAt: "desc" } });
  res.json({ assessments: list });
});
