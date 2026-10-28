import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

export interface SimulationInput {
  scenarioType: string;
  entityId: string;
  durationDays: number;
  inventoryBufferDays: number;
  supplyReductionPct: number;
}

export interface SimulationResult {
  shortfallPct: number;
  shortfallFromDay: number;
  recoveryWindowDays: { min: number; max: number };
  exposedProjects: number;
  exposedProjectIds: string[];
  affectedNodes: number;
  totalNodes: number;
  affectedEntityIds: string[];
  /** Daily supply index (100 = baseline) across the modeled horizon. */
  series: { day: number; supplyIndex: number }[];
  /** Nine bucketed bars for the UI chart; `impact` marks the shortfall window. */
  bars: { height: number; impact: boolean }[];
  horizonDays: number;
  disclaimer: string;
}

const SCENARIO_SEVERITY: Record<string, number> = {
  "Supplier shutdown": 1.0,
  "Port closure": 0.85,
  "Export restriction": 0.9,
  "Natural hazard": 0.75,
};

/** Walk downstream links from the affected entity. */
async function downstream(entityId: string): Promise<Set<string>> {
  const links = await prisma.link.findMany({ select: { fromId: true, toId: true } });
  const adj = new Map<string, string[]>();
  for (const l of links) adj.set(l.fromId, [...(adj.get(l.fromId) ?? []), l.toId]);
  const seen = new Set<string>([entityId]);
  const queue = [entityId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export async function runSimulation(input: SimulationInput): Promise<SimulationResult> {
  const entity = await prisma.entity.findUnique({
    where: { id: input.entityId },
    include: { outgoing: true },
  });
  if (!entity) throw notFound("Entity");

  const severity = SCENARIO_SEVERITY[input.scenarioType] ?? 1;
  const reduction = Math.min(100, Math.max(0, input.supplyReductionPct)) / 100;

  // Share of modeled supply flowing through this entity (sum of outgoing link shares, capped at 1).
  const share = Math.min(1, entity.outgoing.reduce((s, l) => s + l.volumeShare, 0) || entity.dependencyScore / 100);

  const shortfall = Math.round(reduction * share * severity * 100);
  const fromDay = input.inventoryBufferDays + 1;

  const affected = await downstream(entity.id);
  const totalNodes = await prisma.entity.count();
  const exposed = await prisma.projectEntity.findMany({
    where: { entityId: { in: [...affected] } },
    select: { projectId: true },
    distinct: ["projectId"],
  });

  const rampDays = 15;
  const recoveryMin = Math.round(input.durationDays * 1.3 + shortfall * 0.1);
  const recoveryMax = Math.round(input.durationDays * 1.7 + shortfall * 0.3);
  const horizon = input.durationDays + recoveryMax;

  const series: SimulationResult["series"] = [];
  for (let day = 0; day <= horizon; day++) {
    let idx = 100;
    if (day >= fromDay && day < fromDay + rampDays) {
      idx = 100 - (shortfall * (day - fromDay + 1)) / rampDays;
    } else if (day >= fromDay + rampDays && day <= input.durationDays) {
      idx = 100 - shortfall;
    } else if (day > input.durationDays) {
      const recoverDays = recoveryMax - input.durationDays;
      const t = Math.min(1, (day - input.durationDays) / Math.max(1, recoverDays));
      idx = 100 - shortfall + shortfall * t;
    }
    series.push({ day, supplyIndex: Math.round(idx * 10) / 10 });
  }

  const bucket = Math.ceil(series.length / 9);
  const bars = Array.from({ length: 9 }, (_, i) => {
    const slice = series.slice(i * bucket, (i + 1) * bucket);
    const avg = slice.reduce((s, p) => s + p.supplyIndex, 0) / Math.max(1, slice.length);
    const height = Math.round(Math.max(5, Math.min(100, avg - 15)));
    const midDay = i * bucket + bucket / 2;
    return { height, impact: midDay >= fromDay && midDay <= input.durationDays };
  });

  return {
    shortfallPct: shortfall,
    shortfallFromDay: fromDay,
    recoveryWindowDays: { min: recoveryMin, max: recoveryMax },
    exposedProjects: exposed.length,
    exposedProjectIds: exposed.map((p) => p.projectId),
    affectedNodes: affected.size,
    totalNodes,
    affectedEntityIds: [...affected],
    series,
    bars,
    horizonDays: horizon,
    disclaimer: "Illustrative scenario, not a prediction.",
  };
}
