import { prisma } from "../lib/prisma";
import { computeConcentration } from "./dependency";

export interface ReportSection {
  heading: string;
  body: string;
  bullets?: string[];
}

export interface GenerateReportInput {
  title?: string;
  type: "Decision brief" | "Scenario" | "Review" | "Assessment";
  materialSlug?: string;
  simulationId?: string;
  tariffScenarioId?: string;
}

/** Builds a decision-ready brief from current data. Returns sections + headline rating. */
export async function buildReport(input: GenerateReportInput) {
  const sections: ReportSection[] = [];
  let rating: "High" | "Moderate" | "Low" = "Moderate";
  let score = 60;
  let title = input.title;

  const material = input.materialSlug
    ? await prisma.material.findUnique({ where: { slug: input.materialSlug } })
    : await prisma.material.findFirst({ where: { slug: "gallium-nitride" } });

  if (material) {
    const conc = await computeConcentration(material.slug);
    const highRisk = await prisma.entity.findMany({
      where: { risk: "high", materials: { some: { materialId: material.id } } },
      select: { name: true, dependencyScore: true, region: true },
    });
    title ??= `${material.name} strategic dependency brief`;
    rating = conc.concentration;
    score = Math.min(100, Math.round(conc.hhi / 35));
    sections.push({
      heading: "Executive summary",
      body: `${material.name} supply shows ${conc.concentration.toLowerCase()} supplier concentration (HHI ${conc.hhi.toLocaleString()}). The top two upstream sources account for ${conc.topTwoSharePct}% of modeled supply.`,
    });
    sections.push({
      heading: "Key dependencies",
      body: `${highRisk.length} high-risk entities are connected to ${material.name}.`,
      bullets: highRisk.map((e) => `${e.name} (${e.region ?? "region unknown"}) - dependency score ${e.dependencyScore}/100`),
    });
    sections.push({
      heading: "Supplier concentration",
      body: "Modeled share of supply by upstream source.",
      bullets: conc.suppliers.map((s) => `${s.name}: ${s.sharePct}%`),
    });
  }

  if (input.simulationId) {
    const sim = await prisma.simulation.findUnique({ where: { id: input.simulationId }, include: { entity: true } });
    if (sim) {
      const r = JSON.parse(sim.result);
      title ??= `${sim.durationDays}-day ${sim.scenarioType.toLowerCase()} scenario`;
      sections.push({
        heading: "Disruption scenario",
        body: `${sim.scenarioType} at ${sim.entity.name} for ${sim.durationDays} days with ${sim.supplyReductionPct}% supply reduction and ${sim.inventoryBufferDays}-day buffer.`,
        bullets: [
          `Estimated supply shortfall: ${r.shortfallPct}% from day ${r.shortfallFromDay}`,
          `Recovery window: ${r.recoveryWindowDays.min}-${r.recoveryWindowDays.max} days`,
          `Affected nodes: ${r.affectedNodes} of ${r.totalNodes}`,
          `Exposed projects: ${r.exposedProjects}`,
        ],
      });
    }
  }

  if (input.tariffScenarioId) {
    const t = await prisma.tariffScenario.findUnique({ where: { id: input.tariffScenarioId } });
    if (t) {
      const r = JSON.parse(t.result);
      title ??= `Tariff scenario: ${t.product}`;
      sections.push({
        heading: "Trade-policy impact",
        body: `${t.origin} to ${t.destination}, ${t.product}, proposed duty ${t.dutyPct}%.`,
        bullets: [
          `Current modeled landed cost: $${r.currentLandedCost.toLocaleString()}`,
          `Scenario landed cost: $${r.scenarioLandedCost.toLocaleString()}`,
          `Delta: +$${r.delta.toLocaleString()} (${r.deltaPct}% increase)`,
        ],
      });
    }
  }

  sections.push({
    heading: "Evidence and limitations",
    body: "Relationships shown include inferred links derived from documented trade flows and processing capacity estimates. Figures are illustrative and should be validated before operational use.",
  });

  return { title: title ?? "Intelligence brief", rating, score, sections };
}

/** Plain-text rendering used by the download endpoint. */
export function renderReportText(title: string, sections: ReportSection[], generatedAt: Date) {
  const lines: string[] = [title.toUpperCase(), `Generated ${generatedAt.toISOString()}`, "", "Meridian Supply Chain Intelligence", ""];
  for (const s of sections) {
    lines.push(`## ${s.heading}`, s.body);
    for (const b of s.bullets ?? []) lines.push(`  - ${b}`);
    lines.push("");
  }
  return lines.join("\n");
}
