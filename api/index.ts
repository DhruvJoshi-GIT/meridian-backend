/*
  Vercel serverless entry. Every request is rewritten here (see vercel.json) and handed to the
  Express app. Vercel's filesystem is read-only except /tmp, so on a cold start the seeded SQLite
  database is copied to /tmp and Prisma is pointed at the copy. Writes (new simulations, reports)
  live for the lifetime of that function instance. For durable data point DATABASE_URL at Postgres.
*/
import fs from "node:fs";
import path from "node:path";

if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const src = path.join(process.cwd(), "prisma", "dev.db");
  const dst = "/tmp/meridian.db";
  if (!fs.existsSync(dst) && fs.existsSync(src)) fs.copyFileSync(src, dst);
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:")) process.env.DATABASE_URL = `file:${dst}`;
}

// Required after the environment is set, because the Prisma client reads DATABASE_URL on construction.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createApp } = require("../src/app") as typeof import("../src/app");

export default createApp();
