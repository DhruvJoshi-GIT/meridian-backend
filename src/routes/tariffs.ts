import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { calculateTariff } from "../services/tariff";
import { laneSummary, simulateTariff } from "../services/tariffSim";
import { simulateExporter, exporterCurves, runAbsorber } from "../services/exporterSim";
import { notFound } from "../lib/errors";

export const tariffsRouter = Router();

const tariffSchema = z.object({
  name: z.string().optional(),
  origin: z.string().min(1).default("Singapore"),
  destination: z.string().min(1).default("United Kingdom"),
  product: z.string().min(1).default("Gallium nitride wafers"),
  hsCode: z.string().optional(),
  hsStatus: z.string().default("Illustrative - Review required"),
  dutyPct: z.coerce.number().min(0).max(100),
  currentDutyPct: z.coerce.number().min(0).max(100).default(0),
  baseCost: z.coerce.number().min(0).default(100000),
  freight: z.coerce.number().min(0).default(6500),
  insurance: z.coerce.number().min(0).default(1800),
});

/** Defaults for the Trade scenario form. */
tariffsRouter.get("/options", (_req, res) => {
  res.json({
    origins: ["Singapore", "Taiwan", "Japan", "South Korea", "Germany", "United States"],
    destinations: ["United Kingdom", "Germany", "United States", "France", "Netherlands"],
    products: [
      { name: "Gallium nitride wafers", hsCode: "3818.00" },
      { name: "6N gallium metal", hsCode: "8112.92" },
      { name: "RF power amplifier modules", hsCode: "8543.70" },
    ],
    defaults: { origin: "Singapore", destination: "United Kingdom", product: "Gallium nitride wafers", hsCode: "3818.00", dutyPct: 10, baseCost: 100000, freight: 6500, insurance: 1800, maxDutyPct: 30 },
  });
});

/** Trade lanes for a material with the indicative current duty on each (tariff simulator). */
tariffsRouter.get("/lanes", async (req, res) => {
  const { material } = parse(z.object({ material: z.string().default("gallium-nitride") }), req.query);
  const [summary, materials] = await Promise.all([laneSummary(material), prisma.tradeLane.findMany({ select: { materialSlug: true }, distinct: ["materialSlug"] })]);
  const names = await prisma.material.findMany({ where: { slug: { in: materials.map((m) => m.materialSlug) } }, select: { slug: true, name: true }, orderBy: { name: "asc" } });
  res.json({ ...summary, materials: names });
});

/** What happens to landed prices across countries if the duty on a material moves to X%. */
tariffsRouter.post("/simulate", async (req, res) => {
  const body = parse(z.object({ material: z.string().default("gallium-nitride"), dutyPct: z.coerce.number().min(0).max(500), destination: z.string().optional(), elasticity: z.coerce.number().max(0).optional() }), req.body ?? {});
  res.json(await simulateTariff(body));
});

const exporterSchema = z.object({
  fob: z.coerce.number().min(0).default(100),
  freight: z.coerce.number().min(0).default(8),
  unitCost: z.coerce.number().min(0).default(80),
  volume: z.coerce.number().min(0).default(100000),
  oldDutyPct: z.coerce.number().min(0).max(500).default(18),
  newDutyPct: z.coerce.number().min(0).max(500).default(33),
  elasticity: z.coerce.number().max(0).default(-1.5),
  absorption: z.coerce.number().min(0).max(1).default(0),
  rivalLanded: z.coerce.number().min(0).optional(),
  extraCostPerUnit: z.coerce.number().min(0).optional(),
});

/** Defaults for the exporter simulator and absorber forms (the worked example). */
tariffsRouter.get("/exporter/defaults", (_req, res) => {
  res.json({ fob: 100, freight: 8, unitCost: 80, volume: 100000, oldDutyPct: 18, newDutyPct: 33, elasticity: -1.5, absorption: 0, rivalLanded: 127.6, absorbShare: 0.5, origin: { dutyPct: 28, extraCostPerUnit: 1 }, shift: { units: 20000, marginPerUnit: 12 } });
});

/** Exporter-side impact of a duty change: landed cost, price, volume, profit, break-even. */
tariffsRouter.post("/exporter", (req, res) => {
  const input = parse(exporterSchema, req.body ?? {});
  res.json({ result: simulateExporter(input), curves: exporterCurves(input) });
});

/** Tariff Absorber: compare mitigation actions with doing nothing. */
tariffsRouter.post("/absorber", (req, res) => {
  const input = parse(exporterSchema.extend({
    absorbShare: z.coerce.number().min(0).max(1).default(0.5),
    origin: z.object({ dutyPct: z.coerce.number().min(0).max(500).default(28), extraCostPerUnit: z.coerce.number().min(0).default(1) }).default({ dutyPct: 28, extraCostPerUnit: 1 }),
    shift: z.object({ units: z.coerce.number().min(0).default(20000), marginPerUnit: z.coerce.number().default(12) }).default({ units: 20000, marginPerUnit: 12 }),
  }), req.body ?? {});
  res.json(runAbsorber(input));
});

/** Stateless calculation (called as the duty slider moves). */
tariffsRouter.post("/calculate", (req, res) => {
  const input = parse(tariffSchema, req.body);
  res.json({ input, result: calculateTariff(input) });
});

tariffsRouter.post("/scenarios", requireAuth, async (req, res) => {
  const input = parse(tariffSchema, req.body);
  const result = calculateTariff(input);
  const s = await prisma.tariffScenario.create({
    data: {
      userId: req.user!.id,
      name: input.name ?? `${input.product} ${input.origin}-${input.destination} @ ${input.dutyPct}%`,
      origin: input.origin,
      destination: input.destination,
      product: input.product,
      hsCode: input.hsCode,
      hsStatus: input.hsStatus,
      dutyPct: input.dutyPct,
      baseCost: input.baseCost,
      freight: input.freight,
      insurance: input.insurance,
      result: JSON.stringify(result),
    },
  });
  res.status(201).json({ scenario: { ...s, result } });
});

tariffsRouter.get("/scenarios", requireAuth, async (req, res) => {
  const list = await prisma.tariffScenario.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json({ scenarios: list.map((s) => ({ ...s, result: JSON.parse(s.result) })) });
});

tariffsRouter.get("/scenarios/:id", requireAuth, async (req, res) => {
  const s = await prisma.tariffScenario.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!s) throw notFound("Tariff scenario");
  res.json({ scenario: { ...s, result: JSON.parse(s.result) } });
});

tariffsRouter.delete("/scenarios/:id", requireAuth, async (req, res) => {
  await prisma.tariffScenario.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
  res.status(204).end();
});
