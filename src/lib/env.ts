import "dotenv/config";

function bool(v: string | undefined, fallback: boolean) {
  if (v === undefined) return fallback;
  return ["1", "true", "yes"].includes(v.toLowerCase());
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  authRequired: bool(process.env.AUTH_REQUIRED, false),
  /** Allowed browser origins; "*" allows any origin (public demo). */
  corsOrigins: ((): string[] | boolean => {
    const list = (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim()).filter(Boolean);
    return list.includes("*") ? true : list;
  })(),
};
