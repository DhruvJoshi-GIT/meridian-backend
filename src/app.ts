import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./lib/env";
import { authenticate } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { authRouter } from "./routes/auth";
import { overviewRouter } from "./routes/overview";
import { searchRouter } from "./routes/search";
import { materialsRouter } from "./routes/materials";
import { entitiesRouter } from "./routes/entities";
import { mapRouter } from "./routes/map";
import { supplyChainsRouter } from "./routes/supplyChains";
import { alertsRouter } from "./routes/alerts";
import { activityRouter } from "./routes/activity";
import { simulationsRouter } from "./routes/simulations";
import { tariffsRouter } from "./routes/tariffs";
import { dependencyRouter } from "./routes/dependency";
import { alternativesRouter } from "./routes/alternatives";
import { reportsRouter } from "./routes/reports";
import { dataSourcesRouter } from "./routes/dataSources";
import { journeyRouter } from "./routes/journey";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  if (env.nodeEnv !== "test") app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/", (_req, res) => res.json({
    service: "Meridian Supply Chain Intelligence API",
    docs: "https://github.com/DhruvJoshi-GIT/meridian-backend#api",
    health: "/api/health",
    start: ["/api/overview", "/api/map", "/api/dependency", "/api/simulations/options"],
  }));
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "meridian-backend", time: new Date().toISOString() }));

  app.use("/api", authenticate);
  app.use("/api/auth", authRouter);
  app.use("/api", overviewRouter); // /api/overview, /api/metrics
  app.use("/api/search", searchRouter);
  app.use("/api/materials", materialsRouter);
  app.use("/api/entities", entitiesRouter);
  app.use("/api/map", mapRouter);
  app.use("/api/supply-chains", supplyChainsRouter);
  app.use("/api/alerts", alertsRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/simulations", simulationsRouter);
  app.use("/api/tariffs", tariffsRouter);
  app.use("/api/dependency", dependencyRouter);
  app.use("/api/alternatives", alternativesRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/data-sources", dataSourcesRouter);
  app.use("/api/journey", journeyRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);
  return app;
}
