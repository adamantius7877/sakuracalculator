import pg from "pg";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var calorieDashboardPool: pg.Pool | undefined;
}

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  globalThis.calorieDashboardPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  return globalThis.calorieDashboardPool;
}
