import { prisma } from "../lib/prisma";
import { notFound } from "../lib/errors";

export interface SimulateInput {
  material: string;        // material slug
  dutyPct: number;         // the tariff the user wants to test, applied to every selected lane
  destination?: string;    // ISO code to narrow to one importing country
  elasticity?: number;     // price elasticity of demand (negative), default -0.6
}

const landed = (base: number, duty: number, freight: number, insurance: number) => Math.round(base * (1 + duty / 100) + freight + insurance);

export async function laneSummary(materialSlug: string) {
  const material = await prisma.material.findUnique({ where: { slug: materialSlug } });
  if (!material) throw notFound("Material");
  const lanes = await prisma.tradeLane.findMany({ where: { materialSlug }, orderBy: [{ volumeShare: "desc" }] });
  const totalShare = lanes.reduce((s, l) => s + l.volumeShare, 0) || 1;
  const referenceDutyPct = Math.round((lanes.reduce((s, l) => s + l.currentDutyPct * l.volumeShare, 0) / totalShare) * 100) / 100;
  const destinations = [...new Map(lanes.map((l) => [l.destinationCode, { code: l.destinationCode, name: l.destination, currentDutyPct: l.currentDutyPct }])).values()];
  return { material: { slug: material.slug, name: material.name }, lanes, referenceDutyPct, destinations, hsCodes: [...new Set(lanes.map((l) => l.hsCode))] };
}

export async function simulateTariff(input: SimulateInput) {
  const base = await laneSummary(input.material);
  const elasticity = input.elasticity ?? -0.6;
  const selected = input.destination ? base.lanes.filter((l) => l.destinationCode === input.destination) : base.lanes;
  if (!selected.length) throw notFound("Trade lane");
  const totalShare = selected.reduce((s, l) => s + l.volumeShare, 0) || 1;

  const lanes = selected.map((l) => {
    const currentLanded = landed(l.baseCost, l.currentDutyPct, l.freight, l.insurance);
    const simulatedLanded = landed(l.baseCost, input.dutyPct, l.freight, l.insurance);
    const delta = simulatedLanded - currentLanded;
    const deltaPct = Math.round((delta / currentLanded) * 1000) / 10;
    return {
      id: l.id, origin: l.origin, originCode: l.originCode, destination: l.destination, destinationCode: l.destinationCode,
      product: l.product, hsCode: l.hsCode, unit: l.unit, volumeShare: l.volumeShare, note: l.note,
      baseCost: l.baseCost, freight: l.freight, insurance: l.insurance,
      currentDutyPct: l.currentDutyPct, simulatedDutyPct: input.dutyPct,
      currentLanded, simulatedLanded, delta, deltaPct,
      dutyDeltaPct: Math.round((input.dutyPct - l.currentDutyPct) * 100) / 100,
      volumeDeltaPct: Math.round(elasticity * deltaPct * 10) / 10,
      direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    };
  });

  const byDestination = [...new Map(lanes.map((l) => [l.destinationCode, l.destination])).entries()].map(([code, name]) => {
    const rows = lanes.filter((l) => l.destinationCode === code);
    const share = rows.reduce((s, r) => s + r.volumeShare, 0) || 1;
    const w = (f: (r: (typeof rows)[number]) => number) => Math.round((rows.reduce((s, r) => s + f(r) * r.volumeShare, 0) / share) * 10) / 10;
    return { code, name, lanes: rows.length, currentDutyPct: w((r) => r.currentDutyPct), currentLanded: Math.round(w((r) => r.currentLanded)), simulatedLanded: Math.round(w((r) => r.simulatedLanded)), deltaPct: w((r) => r.deltaPct), volumeDeltaPct: w((r) => r.volumeDeltaPct) };
  }).sort((a, b) => b.deltaPct - a.deltaPct);

  const weightedDeltaPct = Math.round((lanes.reduce((s, l) => s + l.deltaPct * l.volumeShare, 0) / totalShare) * 10) / 10;
  const weightedCurrent = Math.round(lanes.reduce((s, l) => s + l.currentLanded * l.volumeShare, 0) / totalShare);
  const weightedSimulated = Math.round(lanes.reduce((s, l) => s + l.simulatedLanded * l.volumeShare, 0) / totalShare);

  const maxDuty = Math.max(50, Math.ceil(input.dutyPct / 10) * 10);
  const curve = Array.from({ length: maxDuty + 1 }, (_, d) => {
    const idx = selected.reduce((s, l) => s + (landed(l.baseCost, d, l.freight, l.insurance) / landed(l.baseCost, l.currentDutyPct, l.freight, l.insurance)) * l.volumeShare, 0) / totalShare;
    return { dutyPct: d, indexPct: Math.round((idx - 1) * 1000) / 10 };
  });

  const referenceDutyPct = input.destination ? lanes[0].currentDutyPct : base.referenceDutyPct;
  return {
    material: base.material, dutyPct: input.dutyPct, destination: input.destination ?? null, referenceDutyPct, elasticity,
    summary: { lanes: lanes.length, weightedDeltaPct, weightedCurrent, weightedSimulated, volumeDeltaPct: Math.round(elasticity * weightedDeltaPct * 10) / 10, direction: weightedDeltaPct > 0 ? "up" : weightedDeltaPct < 0 ? "down" : "flat" },
    lanes, byDestination, curve, maxDutyPct: maxDuty,
    disclaimer: "Reference duties are indicative MFN rates for the stated HS codes. Confirm classification and applicable duty with a customs professional before relying on this.",
  };
}
