import { getPool, hasDatabaseUrl } from "@/lib/server/db";
import type { Food, FoodType } from "@/lib/types";

export const runtime = "nodejs";

function rowNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function foodType(value: unknown): FoodType {
  return value === "meal-non-grocery" || value === "restaurant" || value === "drink"
    ? value
    : "meal";
}

function foodFromRow(row: Record<string, unknown>): Food {
  return {
    id: String(row.id),
    name: String(row.name),
    type: foodType(row.type),
    calories: rowNumber(row.calories),
    servings: row.servings == null ? undefined : rowNumber(row.servings),
    serving: row.serving == null ? undefined : String(row.serving),
    ingredients: row.ingredients == null ? undefined : String(row.ingredients),
    source: row.source == null ? undefined : String(row.source),
    protein: row.protein == null ? undefined : rowNumber(row.protein),
    carbs: row.carbs == null ? undefined : rowNumber(row.carbs),
    fat: row.fat == null ? undefined : rowNumber(row.fat),
  };
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!origin) return {};

  const allowOrigin =
    allowed.includes("*") || allowed.includes(origin) ? origin : undefined;

  return allowOrigin
    ? {
        "access-control-allow-origin": allowOrigin,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      }
    : {};
}

function json(request: Request, body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { ...corsHeaders(request), ...init?.headers },
  });
}

function unavailable(request: Request) {
  return json(
    request,
    {
      configured: false,
      error: "DATABASE_URL is not configured.",
    },
    { status: 503 },
  );
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  if (!hasDatabaseUrl()) return unavailable(request);

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const pool = getPool();

  try {
    const result =
      type === "meal" ||
      type === "meal-non-grocery" ||
      type === "restaurant" ||
      type === "drink"
        ? await pool.query(
            "select id, name, type, source, serving, servings, ingredients, calories, protein, carbs, fat from foods where type = $1 order by updated_at desc, name",
            [type],
          )
        : await pool.query(
            "select id, name, type, source, serving, servings, ingredients, calories, protein, carbs, fat from foods order by updated_at desc, name",
          );

    return json(request, { configured: true, foods: result.rows.map(foodFromRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Food library read failed.";
    return json(request, { error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) return unavailable(request);

  try {
    const payload = (await request.json()) as Partial<Food>;
    const name = payload.name?.trim();
    const calories = Number(payload.calories);

    if (!payload.id || !name || !Number.isFinite(calories) || calories <= 0) {
      return json(request, { error: "Food id, name, and calories are required." }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      `insert into foods
         (id, name, type, source, serving, servings, ingredients, calories, protein, carbs, fat, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       on conflict (id)
       do update set name = excluded.name,
                     type = excluded.type,
                     source = excluded.source,
                     serving = excluded.serving,
                     servings = excluded.servings,
                     ingredients = excluded.ingredients,
                     calories = excluded.calories,
                     protein = excluded.protein,
                     carbs = excluded.carbs,
                     fat = excluded.fat,
                     updated_at = now()
       returning id, name, type, source, serving, servings, ingredients, calories, protein, carbs, fat`,
      [
        payload.id,
        name,
        foodType(payload.type),
        payload.source || null,
        payload.serving || null,
        payload.servings ?? null,
        payload.ingredients || null,
        calories,
        payload.protein ?? null,
        payload.carbs ?? null,
        payload.fat ?? null,
      ],
    );

    return json(request, { ok: true, food: foodFromRow(result.rows[0]) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Food library write failed.";
    return json(request, { error: message }, { status: 500 });
  }
}
