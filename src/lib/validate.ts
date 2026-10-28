import type { ZodType } from "zod";
import { badRequest } from "./errors";

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest("Validation failed", r.error.issues);
  return r.data;
}
