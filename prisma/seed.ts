/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateTariff } from "../src/services/tariff";

const prisma = new PrismaClient();

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000);

async function main() {
  console.log("Resetting data...");
  await prisma.$transaction([
    prisma.activity.deleteMany(),
    prisma.report.deleteMany(),
    prisma.tariffScenario.deleteMany(),
    prisma.simulation.deleteMany(),
    prisma.dependencyItem.deleteMany(),
    prisma.dependencyAssessment.deleteMany(),
    prisma.alternativeSource.deleteMany(),
    prisma.alert.deleteMany(),
    prisma.projectEntity.deleteMany(),
    prisma.project.deleteMany(),
    prisma.supplyChainStage.deleteMany(),
    prisma.supplyChain.deleteMany(),
    prisma.link.deleteMany(),
    prisma.entityMaterial.deleteMany(),
    prisma.entity.deleteMany(),
    prisma.material.deleteMany(),
    prisma.dataSource.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ---------- Users ----------
  const user = await prisma.user.create({
    data: {
      email: "alex.morgan@meridian.local",
      passwordHash: await bcrypt.hash("meridian123", 10),
      name: "Alex Morgan",
      title: "Strategic Analyst",
      initials: "AM",
    },
  });

  // ---------- Materials ----------
  const materialsData = [
    { slug: "gallium", name: "Gallium", symbol: "Ga", category: "Critical material", criticality: "high", description: "By-product of bauxite/alumina refining; essential for compound semiconductors." },
    { slug: "gallium-6n", name: "6N Gallium", symbol: "6N Ga", category: "Refined material", criticality: "high" },
    { slug: "gallium-nitride", name: "Gallium Nitride (GaN)", symbol: "GaN", category: "Compound semiconductor", criticality: "high", description: "Wide-bandgap semiconductor used in radar, RF and power electronics." },
    { slug: "bauxite", name: "Bauxite", symbol: "Al(OH)3", category: "Raw material", criticality: "low" },
    { slug: "germanium", name: "Germanium", symbol: "Ge", category: "Critical material", criticality: "high" },
    { slug: "rare-earths", name: "Rare earth elements", symbol: "REE", category: "Critical material", criticality: "high" },
    { slug: "silicon-carbide", name: "Silicon Carbide (SiC)", symbol: "SiC", category: "Compound semiconductor", criticality: "medium" },
    { slug: "tungsten", name: "Tungsten", symbol: "W", category: "Critical material", criticality: "medium" },
    { slug: "cobalt", name: "Cobalt", symbol: "Co", category: "Battery material", criticality: "medium" },
    { slug: "lithium", name: "Lithium", symbol: "Li", category: "Battery material", criticality: "medium" },
    { slug: "titanium-sponge", name: "Titanium sponge", symbol: "Ti", category: "Aerospace material", criticality: "medium" },
    { slug: "neon", name: "Neon (semiconductor grade)", symbol: "Ne", category: "Process gas", criticality: "low" },
  ];
  const materials: Record<string, { id: string }> = {};
  for (const m of materialsData) materials[m.slug] = await prisma.material.create({ data: m });

  // ---------- Entities ----------
  type E = Parameters<typeof prisma.entity.create>[0]["data"];
  const entitiesData: E[] = [
    { slug: "bauxite-feedstock", name: "Bauxite feedstock", type: "RAW_MATERIAL", typeLabel: "Raw material", region: "Australia", country: "AU", lat: -22.5, lng: 118.0, mapX: 11, mapY: 72, risk: "low", dependencyScore: 22, confidence: "High", evidenceStatus: "Documented", description: "Primary bauxite mining and alumina refining feedstock." },
    { slug: "coastal-refining", name: "Coastal Refining", type: "PROCESSING", typeLabel: "Processing", region: "East Asia (illustrative)", country: "CN", lat: 30.6, lng: 121.5, mapX: 21, mapY: 48, risk: "high", dependencyScore: 82, confidence: "Moderate", evidenceStatus: "Inferred", evidenceNote: "Derived from documented trade flows and processing capacity estimates.", description: "Gallium processing facility" },
    { slug: "inland-gallium-processing", name: "Inland Gallium Processing", type: "PROCESSING", typeLabel: "Processing", region: "East Asia (illustrative)", country: "CN", lat: 34.3, lng: 108.9, mapX: 27, mapY: 40, risk: "high", dependencyScore: 74, confidence: "Low", evidenceStatus: "Estimated", evidenceNote: "Capacity estimated from regional alumina output.", description: "Secondary gallium extraction and 4N refining" },
    { slug: "pacific-gan-works", name: "Pacific GaN Works", type: "MANUFACTURER", typeLabel: "Manufacturer", region: "Singapore", country: "SG", lat: 1.35, lng: 103.8, mapX: 38, mapY: 34, risk: "medium", dependencyScore: 69, confidence: "High", evidenceStatus: "Documented", description: "GaN epitaxy and wafer manufacturing" },
    { slug: "port-of-singapore", name: "Port of Singapore", type: "LOGISTICS", typeLabel: "Logistics", region: "Singapore", country: "SG", lat: 1.26, lng: 103.84, mapX: 55, mapY: 55, risk: "low", dependencyScore: 48, confidence: "High", evidenceStatus: "Documented", isChokepoint: true, chokepointStatus: "normal", description: "Transshipment hub for wafer exports" },
    { slug: "malacca-corridor", name: "Malacca Corridor", type: "LOGISTICS", typeLabel: "Maritime route", region: "Strait of Malacca", lat: 2.5, lng: 101.5, mapX: 47, mapY: 62, risk: "medium", dependencyScore: 56, confidence: "Moderate", evidenceStatus: "Estimated", isChokepoint: true, chokepointStatus: "elevated", description: "Monitored maritime corridor carrying above-normal dependency volume." },
    { slug: "suez-canal", name: "Suez Canal", type: "LOGISTICS", typeLabel: "Maritime route", region: "Egypt", country: "EG", lat: 30.5, lng: 32.3, mapX: 64, mapY: 46, risk: "medium", dependencyScore: 51, confidence: "High", evidenceStatus: "Documented", isChokepoint: true, chokepointStatus: "elevated" },
    { slug: "port-of-rotterdam", name: "Port of Rotterdam", type: "LOGISTICS", typeLabel: "Logistics", region: "Netherlands", country: "NL", lat: 51.9, lng: 4.5, mapX: 68, mapY: 30, risk: "low", dependencyScore: 35, confidence: "High", evidenceStatus: "Documented", isChokepoint: true, chokepointStatus: "normal" },
    { slug: "nordic-semiconductors", name: "Nordic Semiconductors", type: "SUPPLIER", typeLabel: "Supplier", region: "Norway", country: "NO", lat: 59.9, lng: 10.7, mapX: 72, mapY: 38, risk: "low", dependencyScore: 41, confidence: "High", evidenceStatus: "Documented", description: "RF front-end module supplier" },
    { slug: "nordic-semi-materials", name: "Nordic Semi Materials", type: "SUPPLIER", typeLabel: "Supplier", region: "Finland", country: "FI", lat: 60.2, lng: 24.9, mapX: 75, mapY: 30, risk: "low", dependencyScore: 43, confidence: "Moderate", evidenceStatus: "Documented", description: "Qualified alternative gallium supplier (recovery from zinc residues)" },
    { slug: "secondary-recovery-hub", name: "Secondary Recovery Hub", type: "SUPPLIER", typeLabel: "Recycling", region: "Germany", country: "DE", lat: 51.2, lng: 6.8, mapX: 69, mapY: 36, risk: "low", dependencyScore: 30, confidence: "Moderate", evidenceStatus: "Inferred", description: "Scrap GaN and gallium recovery" },
    { slug: "aegis-radar-programme", name: "Aegis Radar Programme", type: "END_USE", typeLabel: "End use", region: "United Kingdom", country: "GB", lat: 51.5, lng: -0.1, mapX: 86, mapY: 54, risk: "medium", dependencyScore: 61, confidence: "High", evidenceStatus: "Documented", description: "Defence electronics" },
    { slug: "ew-suite-programme", name: "Electronic Warfare Suite", type: "END_USE", typeLabel: "End use", region: "United Kingdom", country: "GB", lat: 52.2, lng: -1.5, mapX: 88, mapY: 62, risk: "medium", dependencyScore: 58, confidence: "Moderate", evidenceStatus: "Documented" },
    { slug: "grid-power-electronics", name: "Grid Power Electronics Programme", type: "END_USE", typeLabel: "End use", region: "Germany", country: "DE", lat: 48.1, lng: 11.6, mapX: 82, mapY: 44, risk: "low", dependencyScore: 39, confidence: "Moderate", evidenceStatus: "Inferred" },
    { slug: "ge-refinery-east", name: "Eastern Germanium Refinery", type: "PROCESSING", typeLabel: "Processing", region: "East Asia (illustrative)", country: "CN", lat: 25.0, lng: 102.7, mapX: 24, mapY: 56, risk: "high", dependencyScore: 77, confidence: "Low", evidenceStatus: "Estimated" },
    { slug: "ree-separation-plant", name: "REE Separation Plant", type: "PROCESSING", typeLabel: "Processing", region: "East Asia (illustrative)", country: "CN", lat: 41.1, lng: 113.0, mapX: 30, mapY: 30, risk: "high", dependencyScore: 85, confidence: "Moderate", evidenceStatus: "Documented" },
    { slug: "sic-wafer-fab", name: "Pacific SiC Wafer Fab", type: "MANUFACTURER", typeLabel: "Manufacturer", region: "Taiwan", country: "TW", lat: 24.8, lng: 121.0, mapX: 40, mapY: 42, risk: "medium", dependencyScore: 52, confidence: "High", evidenceStatus: "Documented" },
    { slug: "tungsten-smelter", name: "Highland Tungsten Smelter", type: "PROCESSING", typeLabel: "Processing", region: "Vietnam", country: "VN", lat: 21.0, lng: 105.8, mapX: 34, mapY: 52, risk: "medium", dependencyScore: 47, confidence: "Moderate", evidenceStatus: "Documented" },
    { slug: "cobalt-refinery", name: "Katanga Cobalt Refinery", type: "PROCESSING", typeLabel: "Processing", region: "DRC", country: "CD", lat: -11.7, lng: 27.5, mapX: 58, mapY: 70, risk: "high", dependencyScore: 71, confidence: "Moderate", evidenceStatus: "Documented" },
    { slug: "battery-cell-plant", name: "Northern Battery Cell Plant", type: "MANUFACTURER", typeLabel: "Manufacturer", region: "Poland", country: "PL", lat: 51.1, lng: 17.0, mapX: 74, mapY: 42, risk: "low", dependencyScore: 36, confidence: "High", evidenceStatus: "Documented" },
  ];
  const entities: Record<string, { id: string }> = {};
  for (const e of entitiesData) entities[e.slug] = await prisma.entity.create({ data: e });
  const E = (slug: string) => entities[slug].id;
  const M = (slug: string) => materials[slug].id;

  // ---------- Entity <-> Material ----------
  const em: [string, string, string][] = [
    ["bauxite-feedstock", "bauxite", "produces"],
    ["coastal-refining", "gallium", "processes"],
    ["coastal-refining", "gallium-6n", "produces"],
    ["coastal-refining", "gallium-nitride", "processes"],
    ["inland-gallium-processing", "gallium", "processes"],
    ["inland-gallium-processing", "gallium-nitride", "processes"],
    ["pacific-gan-works", "gallium-nitride", "produces"],
    ["pacific-gan-works", "gallium-6n", "consumes"],
    ["port-of-singapore", "gallium-nitride", "transits"],
    ["malacca-corridor", "gallium-nitride", "transits"],
    ["suez-canal", "gallium-nitride", "transits"],
    ["port-of-rotterdam", "gallium-nitride", "transits"],
    ["nordic-semiconductors", "gallium-nitride", "consumes"],
    ["nordic-semiconductors", "gallium-6n", "consumes"],
    ["nordic-semi-materials", "gallium", "produces"],
    ["nordic-semi-materials", "gallium-nitride", "processes"],
    ["secondary-recovery-hub", "gallium", "produces"],
    ["secondary-recovery-hub", "gallium-nitride", "processes"],
    ["aegis-radar-programme", "gallium-nitride", "consumes"],
    ["ew-suite-programme", "gallium-nitride", "consumes"],
    ["grid-power-electronics", "gallium-nitride", "consumes"],
    ["grid-power-electronics", "silicon-carbide", "consumes"],
    ["ge-refinery-east", "germanium", "processes"],
    ["ree-separation-plant", "rare-earths", "processes"],
    ["sic-wafer-fab", "silicon-carbide", "produces"],
    ["tungsten-smelter", "tungsten", "processes"],
    ["cobalt-refinery", "cobalt", "processes"],
    ["battery-cell-plant", "cobalt", "consumes"],
    ["battery-cell-plant", "lithium", "consumes"],
  ];
  await prisma.entityMaterial.createMany({ data: em.map(([e, m, role]) => ({ entityId: E(e), materialId: M(m), role })) });

  // ---------- Links (flows) ----------
  // Upstream GaN supply shares into Pacific GaN Works: 37 + 31 + 17 + 15 = 100 -> HHI ~2,844 (High)
  const links: { from: string; to: string; share: number; material: string; kind?: string; corridor?: string; risk?: string }[] = [
    { from: "bauxite-feedstock", to: "coastal-refining", share: 0.6, material: "bauxite", kind: "flow", risk: "low" },
    { from: "bauxite-feedstock", to: "inland-gallium-processing", share: 0.4, material: "bauxite", kind: "flow", risk: "low" },
    { from: "coastal-refining", to: "pacific-gan-works", share: 0.37, material: "gallium-nitride", kind: "flow", risk: "high" },
    { from: "inland-gallium-processing", to: "pacific-gan-works", share: 0.31, material: "gallium-nitride", kind: "inferred", risk: "high" },
    { from: "nordic-semi-materials", to: "pacific-gan-works", share: 0.17, material: "gallium-nitride", kind: "flow", risk: "low" },
    { from: "secondary-recovery-hub", to: "pacific-gan-works", share: 0.15, material: "gallium-nitride", kind: "inferred", risk: "low" },
    { from: "coastal-refining", to: "nordic-semiconductors", share: 0.21, material: "gallium-6n", kind: "flow", risk: "medium" },
    { from: "pacific-gan-works", to: "port-of-singapore", share: 0.9, material: "gallium-nitride", kind: "route", risk: "low" },
    { from: "port-of-singapore", to: "malacca-corridor", share: 0.85, material: "gallium-nitride", kind: "route", corridor: "Malacca Corridor", risk: "medium" },
    { from: "malacca-corridor", to: "suez-canal", share: 0.7, material: "gallium-nitride", kind: "route", corridor: "Indian Ocean - Red Sea", risk: "medium" },
    { from: "suez-canal", to: "port-of-rotterdam", share: 0.7, material: "gallium-nitride", kind: "route", corridor: "Mediterranean - North Sea", risk: "low" },
    { from: "port-of-rotterdam", to: "nordic-semiconductors", share: 0.4, material: "gallium-nitride", kind: "flow", risk: "low" },
    { from: "port-of-rotterdam", to: "grid-power-electronics", share: 0.2, material: "gallium-nitride", kind: "flow", risk: "low" },
    { from: "nordic-semiconductors", to: "aegis-radar-programme", share: 0.55, material: "gallium-nitride", kind: "flow", risk: "medium" },
    { from: "nordic-semiconductors", to: "ew-suite-programme", share: 0.45, material: "gallium-nitride", kind: "flow", risk: "medium" },
    { from: "sic-wafer-fab", to: "grid-power-electronics", share: 0.6, material: "silicon-carbide", kind: "flow", risk: "medium" },
    { from: "cobalt-refinery", to: "battery-cell-plant", share: 0.72, material: "cobalt", kind: "flow", risk: "high" },
  ];
  await prisma.link.createMany({
    data: links.map((l) => ({ fromId: E(l.from), toId: E(l.to), volumeShare: l.share, materialSlug: l.material, kind: l.kind ?? "flow", corridor: l.corridor, risk: l.risk ?? "low" })),
  });

  // ---------- Supply chain (Explorer) ----------
  const chain = await prisma.supplyChain.create({
    data: {
      materialId: M("gallium-nitride"),
      name: "Gallium Nitride (GaN) - origin to end use",
      note: "Relationships shown are illustrative and include inferred links.",
      stages: {
        create: [
          { order: 0, stage: "RAW MATERIAL", entityId: E("bauxite-feedstock") },
          { order: 1, stage: "PROCESSING", entityId: E("coastal-refining") },
          { order: 2, stage: "MANUFACTURING", entityId: E("pacific-gan-works") },
          { order: 3, stage: "LOGISTICS", entityId: E("malacca-corridor") },
          { order: 4, stage: "END USE", entityId: E("aegis-radar-programme") },
        ],
      },
    },
  });
  await prisma.supplyChain.create({
    data: {
      materialId: M("cobalt"),
      name: "Cobalt - refinery to cell plant",
      stages: {
        create: [
          { order: 0, stage: "PROCESSING", entityId: E("cobalt-refinery") },
          { order: 1, stage: "LOGISTICS", entityId: E("suez-canal") },
          { order: 2, stage: "MANUFACTURING", entityId: E("battery-cell-plant") },
        ],
      },
    },
  });

  // ---------- Projects ----------
  const projectsData = [
    { name: "Aegis radar upgrade - Batch 2", programme: "Aegis Radar Programme", sector: "Defence electronics", exposure: "high", entities: ["aegis-radar-programme", "nordic-semiconductors"] },
    { name: "Aegis radar sustainment", programme: "Aegis Radar Programme", sector: "Defence electronics", exposure: "medium", entities: ["aegis-radar-programme"] },
    { name: "EW suite mid-life update", programme: "Electronic Warfare", sector: "Defence electronics", exposure: "high", entities: ["ew-suite-programme", "nordic-semiconductors"] },
    { name: "EW pod integration", programme: "Electronic Warfare", sector: "Defence electronics", exposure: "medium", entities: ["ew-suite-programme"] },
    { name: "Grid inverter modernisation", programme: "Grid Power Electronics", sector: "Energy", exposure: "medium", entities: ["grid-power-electronics"] },
    { name: "Offshore wind HVDC converters", programme: "Grid Power Electronics", sector: "Energy", exposure: "low", entities: ["grid-power-electronics", "sic-wafer-fab"] },
    { name: "Fleet battery storage pilot", programme: "Energy Storage", sector: "Energy", exposure: "medium", entities: ["battery-cell-plant"] },
    { name: "Secure comms RF modules", programme: "Secure Communications", sector: "Defence electronics", exposure: "high", entities: ["pacific-gan-works", "nordic-semiconductors"] },
  ];
  for (const p of projectsData) {
    await prisma.project.create({
      data: { name: p.name, programme: p.programme, sector: p.sector, exposure: p.exposure, entities: { create: p.entities.map((s) => ({ entityId: E(s) })) } },
    });
  }

  // ---------- Alerts ----------
  await prisma.alert.createMany({
    data: [
      { level: "Critical", title: "Gallium sourcing concentration", body: "Two upstream processors account for 68% of the modeled supply.", kind: "Model warning", relatedPage: "Dependency Analysis", entityId: E("coastal-refining"), createdAt: hoursAgo(2) },
      { level: "Elevated", title: "Malacca corridor exposure", body: "A monitored route is carrying above-normal dependency volume.", kind: "Estimated", relatedPage: "Dependency Analysis", entityId: E("malacca-corridor"), createdAt: hoursAgo(5) },
      { level: "Advisory", title: "Tariff scenario updated", body: "New policy assumptions may affect modeled landed cost.", kind: "Simulated", relatedPage: "Tariff Intelligence", createdAt: daysAgo(1) },
      { level: "Elevated", title: "Suez transit times rising", body: "Average transit through the Suez corridor is up 18% over the 30-day baseline.", kind: "Documented", relatedPage: "Global Map", entityId: E("suez-canal"), createdAt: daysAgo(2) },
      { level: "Advisory", title: "Alternative supplier qualified", body: "Nordic Semi Materials completed qualification for 4N gallium supply.", kind: "Documented", relatedPage: "Alternative Sources", entityId: E("nordic-semi-materials"), createdAt: daysAgo(3) },
    ],
  });

  // ---------- Dependency assessment ----------
  await prisma.dependencyAssessment.create({
    data: {
      materialId: M("gallium-nitride"),
      title: "Gallium Nitride assessment",
      hhi: 2846,
      concentration: "High",
      summary: "Supplier concentration - HHI 2,846 - High concentration",
      updatedAt: new Date("2025-05-06T09:00:00Z"),
      items: {
        create: [
          { rank: 1, entityId: E("coastal-refining"), score: 82, rating: "High", note: "Critical dependency - Illustrative" },
          { rank: 2, entityId: E("pacific-gan-works"), score: 69, rating: "Moderate", note: "Critical dependency - Illustrative" },
          { rank: 3, entityId: E("malacca-corridor"), score: 56, rating: "Moderate", note: "Critical dependency - Illustrative" },
          { rank: 4, entityId: E("nordic-semi-materials"), score: 43, rating: "Low", note: "Critical dependency - Illustrative" },
        ],
      },
    },
  });

  // ---------- Alternative sources ----------
  await prisma.alternativeSource.createMany({
    data: [
      { materialId: M("gallium-nitride"), name: "Nordic Semi Materials - 4N gallium", type: "supplier", region: "Finland", readiness: "Qualified", leadTimeDays: 120, costDeltaPct: 14, riskReduction: 35, notes: "Recovery from zinc processing residues; limited volume." },
      { materialId: M("gallium-nitride"), name: "Secondary Recovery Hub - scrap GaN", type: "recycling", region: "Germany", readiness: "Emerging", leadTimeDays: 180, costDeltaPct: 9, riskReduction: 20, notes: "Dependent on end-of-life return flows." },
      { materialId: M("gallium-nitride"), name: "Cape route via Rotterdam", type: "route", region: "Indian Ocean - Atlantic", readiness: "Qualified", leadTimeDays: 14, costDeltaPct: 6, riskReduction: 25, notes: "Bypasses Malacca and Suez; adds 10-14 days transit." },
      { materialId: M("gallium-nitride"), name: "SiC substitution for power stages", type: "substitution", region: "Taiwan", readiness: "Research", leadTimeDays: 540, costDeltaPct: -3, riskReduction: 40, notes: "Not viable for RF/radar front ends." },
      { materialId: M("gallium-nitride"), name: "Domestic GaN-on-Si pilot line", type: "supplier", region: "United Kingdom", readiness: "Research", leadTimeDays: 720, costDeltaPct: 28, riskReduction: 55, notes: "Requires capital programme approval." },
      { materialId: M("cobalt"), name: "Australian cobalt refinery expansion", type: "supplier", region: "Australia", readiness: "Emerging", leadTimeDays: 365, costDeltaPct: 11, riskReduction: 30 },
    ],
  });

  // ---------- Simulations ----------
  const simResult = {
    shortfallPct: 41, shortfallFromDay: 36, recoveryWindowDays: { min: 121, max: 165 }, exposedProjects: 8, exposedProjectIds: [],
    affectedNodes: 14, totalNodes: entitiesData.length, affectedEntityIds: [], series: [], bars: [85, 84, 82, 65, 48, 43, 47, 57, 68].map((h, i) => ({ height: h, impact: i > 2 && i < 7 })),
    horizonDays: 255, disclaimer: "Illustrative scenario, not a prediction.",
  };
  const sim = await prisma.simulation.create({
    data: { userId: user.id, name: "90-day supplier disruption", scenarioType: "Supplier shutdown", entityId: E("coastal-refining"), durationDays: 90, inventoryBufferDays: 35, supplyReductionPct: 70, result: JSON.stringify(simResult), createdAt: daysAgo(1) },
  });

  // ---------- Tariff scenario ----------
  const tariffInput = { origin: "Singapore", destination: "United Kingdom", product: "Gallium nitride wafers", hsCode: "3818.00", dutyPct: 10, baseCost: 100000, freight: 6500, insurance: 1800 };
  const tariff = await prisma.tariffScenario.create({
    data: { userId: user.id, name: "GaN wafers SG-UK duty scenario", ...tariffInput, hsStatus: "Illustrative - Review required", result: JSON.stringify(calculateTariff(tariffInput)), createdAt: daysAgo(1) },
  });

  // ---------- Reports ----------
  const reportsData = [
    { title: "GaN strategic dependency brief", type: "Decision brief", rating: "High", score: 82, summary: "Gallium nitride supply is highly concentrated in two upstream processors.", createdAt: daysAgo(2) },
    { title: "90-day disruption scenario", type: "Scenario", rating: "Moderate", score: 69, summary: "A 90-day shutdown at Coastal Refining produces a 41% modeled shortfall from day 36.", createdAt: daysAgo(3) },
    { title: "Maritime chokepoint review", type: "Review", rating: "Moderate", score: 56, summary: "Malacca and Suez corridors carry the majority of monitored GaN volume.", createdAt: daysAgo(5) },
    { title: "Alternative sourcing assessment", type: "Assessment", rating: "Low", score: 43, summary: "Qualified alternatives can offset roughly a third of concentration risk within 12 months.", createdAt: daysAgo(8) },
  ];
  for (const r of reportsData) {
    await prisma.report.create({
      data: {
        userId: user.id, title: r.title, type: r.type, rating: r.rating, score: r.score, summary: r.summary, createdAt: r.createdAt, format: "PDF preview",
        content: JSON.stringify([{ heading: "Executive summary", body: r.summary }, { heading: "Evidence and limitations", body: "Illustrative records. Relationships include inferred links." }]),
      },
    });
  }

  // ---------- Activity ----------
  await prisma.activity.createMany({
    data: [
      { userId: user.id, type: "search", title: "Gallium Nitride dependency", refType: "material", refId: M("gallium-nitride"), createdAt: new Date(Date.now() - 18 * 60_000) },
      { userId: user.id, type: "simulation", title: "90-day supplier disruption", refType: "simulation", refId: sim.id, createdAt: daysAgo(1) },
      { userId: user.id, type: "report", title: "Semiconductor resilience brief", refType: "report", createdAt: daysAgo(4) },
      { userId: user.id, type: "view", title: "GaN wafers SG-UK duty scenario", refType: "tariff", refId: tariff.id, createdAt: daysAgo(1) },
    ],
  });

  // ---------- Data sources ----------
  await prisma.dataSource.createMany({
    data: [
      { name: "UN Comtrade trade flows", kind: "Trade flows", status: "healthy", lastUpdatedAt: new Date(Date.now() - 12 * 60_000) },
      { name: "Customs declarations (partner feed)", kind: "Customs", status: "healthy", lastUpdatedAt: hoursAgo(3) },
      { name: "Maritime AIS corridor monitor", kind: "Shipping AIS", status: "degraded", lastUpdatedAt: hoursAgo(1), note: "Coverage gap in the Bay of Bengal." },
      { name: "Trade-policy tracker", kind: "Policy", status: "healthy", lastUpdatedAt: daysAgo(1) },
      { name: "Meridian dependency model v3", kind: "Internal model", status: "healthy", lastUpdatedAt: daysAgo(1) },
    ],
  });

  console.log(`Seeded: ${materialsData.length} materials, ${entitiesData.length} entities, ${links.length} links, chain ${chain.id}`);
  console.log("Demo login: alex.morgan@meridian.local / meridian123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
