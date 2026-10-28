import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { runSimulation } from "../services/simulation";
import { notFound } from "../lib/errors";

export const simulationsRouter = Router();

const SCENARIO_TYPES = ["Supplier shutdown", "Port closure", "Export restriction", "Natural hazard"];

/** Dropdown options for the Configure scenario panel. */
simulationsRouter.get("/options", async (_req, res) => {
  const entities = await prisma.entity.findMany({ where: { type: { in: ["PROCESSING", "MANUFACTURER", "LOGISTICS", "SUPPLIER"] } }, orderBy: { dependencyScore: "desc" }, select: { id: true, slug: true, name: true, typeLabel: true, risk: true } });
  res.json({
    scenarioTypes: SCENARIO_TYPES,
    entities,
    durations: [30, 60, 90, 120, 180],
    inventoryBuffers: [0, 14, 21, 35, 60],
    defaults: { scenarioType: "Supplier shutdown", entitySlug: "coastal-refining", durationDays: 90, inventoryBufferDays: 35, supplyReductionPct: 70 },
  });
});

const runSchema = z.object({
  name: z.string().optional(),
  scenarioType: z.string().min(1),
  entityId: z.string().min(1),
  durationDays: z.coerce.number().int().min(1).max(730),
  inventoryBufferDays: z.coerce.number().int().min(0).max(365),
  supplyReductionPct: z.coerce.number().int().min(0).max(100),
  save: z.coerce.boolean().default(true),
});

/** Run a simulation (persisted by default). Accepts an entity id or slug. */
simulationsRouter.post("/", requireAuth, async (req, res) => {
  const body = parse(runSchema, req.body);
  const entity = await prisma.entity.findFirst({ where: { OR: [{ id: body.entityId }, { slug: body.entityId }] }, select: { id: true, name: true } });
  if (!entity) throw notFound("Entity");

  const result = await runSimulation({ ...body, entityId: entity.id });
  if (!body.save) return res.json({ simulation: { ...body, entity, result, status: "complete" } });

  const sim = await prisma.simulation.create({
    data: {
      userId: req.user!.id,
      name: body.name ?? `${body.durationDays}-day ${body.scenarioType.toLowerCase()}`,
      scenarioType: body.scenarioType,
      entityId: entity.id,
      durationDays: body.durationDays,
      inventoryBufferDays: body.inventoryBufferDays,
      supplyReductionPct: body.supplyReductionPct,
      result: JSON.stringify(result),
    },
    include: { entity: { select: { id: true, slug: true, name: true } } },
  });
  await prisma.activity.create({ data: { userId: req.user!.id, type: "simulation", title: sim.name ?? "Simulation", refType: "simulation", refId: sim.id } });
  res.status(201).json({ simulation: { ...sim, result } });
});

simulationsRouter.get("/", requireAuth, async (req, res) => {
  const sims = await prisma.simulation.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, include: { entity: { select: { id: true, slug: true, name: true } } } });
  res.json({ simulations: sims.map((s) => ({ ...s, result: JSON.parse(s.result) })) });
});

simulationsRouter.get("/:id", requireAuth, async (req, res) => {
  const s = await prisma.simulation.findFirst({ where: { id: String(req.params.id), userId: req.user!.id }, include: { entity: true } });
  if (!s) throw notFound("Simulation");
  res.json({ simulation: { ...s, result: JSON.parse(s.result) } });
});

simulationsRouter.delete("/:id", requireAuth, async (req, res) => {
  await prisma.simulation.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
  res.status(204).end();
});
