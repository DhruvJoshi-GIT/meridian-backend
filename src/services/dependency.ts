import { prisma } from "../lib/prisma";

/** Herfindahl-Hirschman Index from supplier shares (0-1). 0-10,000 scale. */
export function hhi(shares: number[]): number {
  const total = shares.reduce((s, x) => s + x, 0) || 1;
  return Math.round(shares.reduce((s, x) => s + Math.pow((x / total) * 100, 2), 0));
}

export function concentrationLabel(index: number): "Low" | "Moderate" | "High" {
  if (index >= 2500) return "High";
  if (index >= 1500) return "Moderate";
  return "Low";
}

export function ratingFromScore(score: number): "High" | "Moderate" | "Low" {
  if (score >= 70) return "High";
  if (score >= 40) return "Moderate";
  return "Low";
}

/**
 * Compute a live concentration view for a material from link volume shares.
 * Complements the curated DependencyAssessment rows in the database.
 */
export async function computeConcentration(materialSlug: string) {
  // Upstream supply = links feeding the entities that *produce* this material.
  // Downstream logistics routes are excluded so transit shares do not distort the index.
  const producers = await prisma.entityMaterial.findMany({
    where: { material: { slug: materialSlug }, role: "produces" },
    select: { entityId: true },
  });
  const producerIds = producers.map((p) => p.entityId);
  const links = await prisma.link.findMany({
    where: producerIds.length
      ? { materialSlug, toId: { in: producerIds }, kind: { in: ["flow", "inferred"] } }
      : { materialSlug, kind: { in: ["flow", "inferred"] } },
    include: { from: { select: { id: true, name: true, type: true, risk: true } } },
  });
  const byEntity = new Map<string, { entity: (typeof links)[number]["from"]; share: number }>();
  for (const l of links) {
    const cur = byEntity.get(l.fromId);
    if (cur) cur.share += l.volumeShare;
    else byEntity.set(l.fromId, { entity: l.from, share: l.volumeShare });
  }
  const rows = [...byEntity.values()].sort((a, b) => b.share - a.share);
  const index = hhi(rows.map((r) => r.share));
  return {
    hhi: index,
    concentration: concentrationLabel(index),
    suppliers: rows.map((r) => ({ ...r.entity, sharePct: Math.round(r.share * 100) })),
    topTwoSharePct: Math.round(rows.slice(0, 2).reduce((s, r) => s + r.share, 0) * 100),
  };
}
