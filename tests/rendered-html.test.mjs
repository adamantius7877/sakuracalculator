import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard includes the core product surfaces", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Sakura calorie dashboard/);
  assert.match(page, /User Profiles/);
  assert.match(page, /Active profile/);
  assert.match(page, /Body Profile/);
  assert.match(page, /Food Library/);
  assert.match(page, /USDA Food Lookup/);
  assert.match(page, /Published Google Sheet CSV URL/);
  assert.match(page, /Trans woman/);
  assert.match(page, /Trans man/);
  assert.match(page, /Mifflin-St Jeor/);
  assert.doesNotMatch(page, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});

test("postgres persistence API and docker deployment files are present", async () => {
  const [route, migration, compose, dockerfile] = await Promise.all([
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8"),
    readFile(new URL("../compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  ]);

  assert.match(route, /DATABASE_URL/);
  assert.match(route, /user_profiles/);
  assert.match(route, /log_entries/);
  assert.match(migration, /create table if not exists user_profiles/);
  assert.match(migration, /create table if not exists foods/);
  assert.match(compose, /postgres:16-alpine/);
  assert.match(compose, /DATABASE_URL/);
  assert.match(dockerfile, /node scripts\/migrate\.mjs && node server\.js/);
});
