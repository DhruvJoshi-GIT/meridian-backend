import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parse } from "../lib/validate";
import { requireAuth } from "../middleware/auth";
import { buildReport, renderReportText } from "../services/report";
import { notFound } from "../lib/errors";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get("/", async (req, res) => {
  const reports = await prisma.report.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" } });
  res.json({
    reports: reports.map((r, i) => ({ ...r, content: undefined, rank: i + 1, subtitle: `${r.type} - ${r.format}` })),
    note: "Illustrative records",
  });
});

reportsRouter.post("/generate", async (req, res) => {
  const body = parse(
    z.object({
      title: z.string().optional(),
      type: z.enum(["Decision brief", "Scenario", "Review", "Assessment"]).default("Decision brief"),
      materialSlug: z.string().optional(),
      simulationId: z.string().optional(),
      tariffScenarioId: z.string().optional(),
    }),
    req.body ?? {},
  );
  const built = await buildReport(body);
  const r = await prisma.report.create({
    data: {
      userId: req.user!.id,
      title: built.title,
      type: body.type,
      rating: built.rating,
      score: built.score,
      summary: built.sections[0]?.body,
      content: JSON.stringify(built.sections),
      format: "PDF preview",
    },
  });
  await prisma.activity.create({ data: { userId: req.user!.id, type: "report", title: r.title, refType: "report", refId: r.id } });
  res.status(201).json({ report: { ...r, content: built.sections } });
});

reportsRouter.get("/:id", async (req, res) => {
  const r = await prisma.report.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!r) throw notFound("Report");
  res.json({ report: { ...r, content: JSON.parse(r.content) } });
});

/** Plain-text download of a brief. */
reportsRouter.get("/:id/download", async (req, res) => {
  const r = await prisma.report.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!r) throw notFound("Report");
  const text = renderReportText(r.title, JSON.parse(r.content), r.createdAt);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${r.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt"`);
  res.send(text);
});

reportsRouter.delete("/:id", async (req, res) => {
  await prisma.report.deleteMany({ where: { id: String(req.params.id), userId: req.user!.id } });
  res.status(204).end();
});
