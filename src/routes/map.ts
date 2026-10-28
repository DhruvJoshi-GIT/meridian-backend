import { Router } from "express";
import { prisma } from "../lib/prisma";

export const mapRouter = Router();

const COUNTRY: Record<string, string> = { AU: "Australia", CN: "China", SG: "Singapore", IN: "India", EG: "Egypt", NL: "Netherlands", NO: "Norway", GB: "United Kingdom", FI: "Finland", DE: "Germany", TW: "Taiwan", VN: "Vietnam", CD: "DR Congo", PL: "Poland", US: "United States", JP: "Japan", KR: "South Korea" };

/** Small deterministic hash so the illustrative analytics are stable between requests. */
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const pick = (s: string, lo: number, hi: number) => lo + (hash(s) % (hi - lo + 1));

/** Nodes, routes and illustrative analytics for the Global Map and the Overview map card. */
mapRouter.get("/", async (req, res) => {
  const material = typeof req.query.material === "string" && req.query.material !== "all" ? req.query.material : undefined;
  const [nodes, routes, layers] = await Promise.all([
    prisma.entity.findMany({
      where: { lat: { not: null }, materials: material ? { some: { material: { slug: material } } } : undefined },
      select: { id: true, slug: true, name: true, type: true, typeLabel: true, risk: true, region: true, country: true, dependencyScore: true, mapX: true, mapY: true, lat: true, lng: true, isChokepoint: true, chokepointStatus: true, confidence: true, evidenceStatus: true },
    }),
    prisma.link.findMany({
      where: material ? { materialSlug: material } : undefined,
      include: { from: { select: { id: true, slug: true, name: true, lat: true, lng: true, mapX: true, mapY: true } }, to: { select: { id: true, slug: true, name: true, lat: true, lng: true, mapX: true, mapY: true } } },
    }),
    prisma.material.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const count = <T,>(arr: T[], key: (x: T) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const x of arr) { const k = key(x); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const byCountry = count(nodes, (n) => n.country).map(([code, total]) => ({ code, name: COUNTRY[code] ?? code, count: total, highRisk: nodes.filter((n) => n.country === code && n.risk === "high").length, avgScore: Math.round(nodes.filter((n) => n.country === code).reduce((s, n) => s + n.dependencyScore, 0) / total) }));
  const corridors = routes.filter((r) => r.corridor).map((r) => ({
    id: r.id, corridor: r.corridor!, from: r.from.name, to: r.to.name, risk: r.risk, kind: r.kind, material: r.materialSlug,
    volumeSharePct: Math.round(r.volumeShare * 100),
    transitDays: pick(r.id + "t", 2, 18),
    incidents30d: r.risk === "high" ? pick(r.id + "i", 3, 7) : r.risk === "medium" ? pick(r.id + "i", 1, 4) : pick(r.id + "i", 0, 1),
    delayPct: r.risk === "high" ? pick(r.id + "d", 12, 28) : r.risk === "medium" ? pick(r.id + "d", 5, 14) : pick(r.id + "d", 0, 5),
    status: r.risk === "high" ? "elevated" : r.risk === "medium" ? "watch" : "normal",
  })).sort((a, b) => b.volumeSharePct - a.volumeSharePct);
  const today = new Date();
  const transits = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() - (6 - i) * 86400_000);
    const key = d.toISOString().slice(0, 10) + (material ?? "all");
    return { date: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-US", { weekday: "short" }), transits: pick(key + "x", 38, 92), alerts: pick(key + "a", 0, 4) };
  });

  res.json({
    material: material ?? "all",
    nodes,
    routes: routes.map((r) => ({ id: r.id, fromId: r.fromId, toId: r.toId, kind: r.kind, corridor: r.corridor, risk: r.risk, volumeShare: r.volumeShare, material: r.materialSlug, from: r.from, to: r.to })),
    layers: [{ key: "all", label: "All materials" }, ...layers.map((l) => ({ key: l.slug, label: l.name }))],
    legend: [{ key: "low", label: "Low" }, { key: "medium", label: "Moderate" }, { key: "high", label: "High risk" }],
    analytics: {
      totals: {
        nodes: nodes.length, routes: routes.length, countries: byCountry.length,
        chokepoints: nodes.filter((n) => n.isChokepoint).length, chokepointsElevated: nodes.filter((n) => n.isChokepoint && n.chokepointStatus === "elevated").length,
        highRisk: nodes.filter((n) => n.risk === "high").length, inferredLinks: routes.filter((r) => r.kind === "inferred").length,
        avgDependency: nodes.length ? Math.round(nodes.reduce((s, n) => s + n.dependencyScore, 0) / nodes.length) : 0,
      },
      byRisk: ["high", "medium", "low"].map((risk) => ({ risk, count: nodes.filter((n) => n.risk === risk).length })),
      byType: count(nodes, (n) => n.typeLabel).map(([label, c]) => ({ label, count: c })),
      byCountry,
      corridors,
      topExposure: [...nodes].sort((a, b) => b.dependencyScore - a.dependencyScore).slice(0, 6).map((n) => ({ slug: n.slug, name: n.name, typeLabel: n.typeLabel, risk: n.risk, country: n.country ? COUNTRY[n.country] ?? n.country : null, score: n.dependencyScore })),
      transits,
      note: "Transit counts, incidents and delays are illustrative, generated deterministically for the demo.",
    },
  });
});
