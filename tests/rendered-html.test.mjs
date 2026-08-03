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
  assert.match(page, /Meal - Non Grocery/);
  assert.match(page, /Total calories/);
  assert.match(page, /Ingredients/);
  assert.match(page, /USDA Food Lookup/);
  assert.match(page, /Published Google Sheet CSV URL/);
  assert.match(page, /Trans woman/);
  assert.match(page, /Trans man/);
  assert.match(page, /Mifflin-St Jeor/);
  assert.doesNotMatch(page, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});

test("postgres persistence API and docker deployment files are present", async () => {
  const [route, foodsRoute, migration, foodMigration, nonGroceryMigration, compose, dockerfile, sharedApiDoc] = await Promise.all([
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/foods/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/002_food_library_details.sql", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations/003_food_non_grocery_meals.sql", import.meta.url), "utf8"),
    readFile(new URL("../compose.yml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../docs/shared-food-api.md", import.meta.url), "utf8"),
  ]);

  assert.match(route, /DATABASE_URL/);
  assert.match(route, /user_profiles/);
  assert.match(route, /log_entries/);
  assert.doesNotMatch(route, /delete from foods/);
  assert.match(foodsRoute, /type=meal|type/);
  assert.match(foodsRoute, /on conflict \(id\)/);
  assert.doesNotMatch(route, /fdc_api_key/);
  assert.match(migration, /create table if not exists user_profiles/);
  assert.match(migration, /create table if not exists foods/);
  assert.match(foodMigration, /add column if not exists type/);
  assert.match(foodMigration, /foods_type_check/);
  assert.match(nonGroceryMigration, /meal-non-grocery/);
  assert.match(compose, /postgres:16-alpine/);
  assert.match(compose, /DATABASE_URL/);
  assert.match(compose, /ALLOWED_ORIGINS/);
  assert.match(dockerfile, /node scripts\/migrate\.mjs && node server\.js/);
  assert.match(sharedApiDoc, /GET \/api\/foods\?type=meal/);
});
