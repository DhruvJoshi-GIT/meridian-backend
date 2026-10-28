import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../lib/errors";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  const anyErr = err as { code?: string; message?: string };
  if (anyErr?.code === "P2025") return res.status(404).json({ error: "Resource not found" });
  if (anyErr?.code === "P2002") return res.status(409).json({ error: "Duplicate value" });
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
