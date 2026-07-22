import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

await client.connect();

try {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const migrations = ["001_init.sql"];

  for (const migration of migrations) {
    const version = migration.replace(/\.sql$/, "");
    const existing = await client.query(
      "select 1 from schema_migrations where version = $1",
      [version],
    );

    if (existing.rowCount) {
      console.log(`Skipping ${migration}`);
      continue;
    }

    const sql = await readFile(join(process.cwd(), "db", "migrations", migration), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (version) values ($1)", [
        version,
      ]);
      await client.query("commit");
      console.log(`Applied ${migration}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.end();
}
