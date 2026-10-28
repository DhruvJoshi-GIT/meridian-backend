import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";

export const alternativesRouter = Router();

alternativesRouter.get("/", async (req, res) => {
  const q = parse(z.object({ material: z.string().default("gallium-nitride"), type: z.enum(["supplier", "route", "recycling", "substitution"]).optional() }), req.query);
  const alternatives = await prisma.alternativeSource.findMany({
    where: { material: { slug: q.material }, type: q.type },
    orderBy: [{ riskReduction: "desc" }],
    include: { material: { select: { slug: true, name: true } } },
  });
  res.json({
    alternatives,
    types: [
      { key: "supplier", label: "Qualified suppliers" },
      { key: "route", label: "Alternative routes" },
      { key: "recycling", label: "Recycling" },
      { key: "substitution", label: "Substitution pathways" },
    ],
  });
});
