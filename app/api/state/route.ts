import { getPool, hasDatabaseUrl } from "@/lib/server/db";
import type { DashboardState, Food, LogEntry, UserProfile } from "@/lib/types";

export const runtime = "nodejs";

function unavailable() {
  return Response.json(
    {
      configured: false,
      error: "DATABASE_URL is not configured. The dashboard will use browser storage.",
    },
    { status: 503 },
  );
}

function rowNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function readState(): Promise<DashboardState | null> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const [settingsResult, profilesResult, foodsResult, logsResult] =
      await Promise.all([
        client.query("select active_profile_id from app_settings where id = 1"),
        client.query(
          "select id, name, profile from user_profiles order by created_at, name",
        ),
        client.query(
          "select id, name, source, serving, calories, protein, carbs, fat from foods order by created_at desc, name",
        ),
        client.query(
          "select id, profile_id, food_id, name, serving, quantity, calories, entry_date from log_entries order by entry_date desc, created_at desc",
        ),
      ]);

    if (profilesResult.rowCount === 0) {
      return null;
    }

    const profiles: UserProfile[] = profilesResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      profile: row.profile,
    }));
    const activeProfileId =
      settingsResult.rows[0]?.active_profile_id ?? profiles[0].id;

    return {
      profiles,
      activeProfileId: profiles.some((profile) => profile.id === activeProfileId)
        ? activeProfileId
        : profiles[0].id,
      foods: foodsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        source: row.source,
        serving: row.serving,
        calories: rowNumber(row.calories),
        protein: row.protein == null ? undefined : rowNumber(row.protein),
        carbs: row.carbs == null ? undefined : rowNumber(row.carbs),
        fat: row.fat == null ? undefined : rowNumber(row.fat),
      })),
      log: logsResult.rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        foodId: row.food_id ?? undefined,
        name: row.name,
        serving: row.serving,
        quantity: rowNumber(row.quantity),
        calories: rowNumber(row.calories),
        date:
          row.entry_date instanceof Date
            ? row.entry_date.toISOString().slice(0, 10)
            : String(row.entry_date),
      })),
    };
  } finally {
    client.release();
  }
}

export async function GET() {
  if (!hasDatabaseUrl()) return unavailable();

  try {
    const state = await readState();
    return Response.json({ configured: true, hasData: Boolean(state), state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database read failed.";
    return Response.json({ configured: true, error: message }, { status: 500 });
  }
}

function cleanProfiles(profiles: UserProfile[]) {
  return profiles.filter((profile) => profile.id && profile.name && profile.profile);
}

function cleanFoods(foods: Food[]) {
  return foods.filter((food) => food.id && food.name && food.serving && food.calories > 0);
}

function cleanLog(log: LogEntry[], profileIds: Set<string>) {
  return log.filter(
    (entry) =>
      entry.id &&
      profileIds.has(entry.profileId) &&
      entry.name &&
      entry.serving &&
      entry.date &&
      entry.calories > 0,
  );
}

export async function PUT(request: Request) {
  if (!hasDatabaseUrl()) return unavailable();

  try {
    const payload = (await request.json()) as DashboardState;
    const profiles = cleanProfiles(payload.profiles ?? []);

    if (profiles.length === 0) {
      return Response.json({ error: "At least one profile is required." }, { status: 400 });
    }

    const profileIds = new Set(profiles.map((profile) => profile.id));
    const activeProfileId = profileIds.has(payload.activeProfileId)
      ? payload.activeProfileId
      : profiles[0].id;
    const foods = cleanFoods(payload.foods ?? []);
    const log = cleanLog(payload.log ?? [], profileIds);
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query("delete from log_entries");
      await client.query("delete from foods");
      await client.query("delete from user_profiles");

      for (const profile of profiles) {
        await client.query(
          "insert into user_profiles (id, name, profile) values ($1, $2, $3::jsonb)",
          [profile.id, profile.name, JSON.stringify(profile.profile)],
        );
      }

      for (const food of foods) {
        await client.query(
          "insert into foods (id, name, source, serving, calories, protein, carbs, fat) values ($1, $2, $3, $4, $5, $6, $7, $8)",
          [
            food.id,
            food.name,
            food.source,
            food.serving,
            food.calories,
            food.protein ?? null,
            food.carbs ?? null,
            food.fat ?? null,
          ],
        );
      }

      for (const entry of log) {
        await client.query(
          "insert into log_entries (id, profile_id, food_id, name, serving, quantity, calories, entry_date) values ($1, $2, $3, $4, $5, $6, $7, $8)",
          [
            entry.id,
            entry.profileId,
            entry.foodId && foods.some((food) => food.id === entry.foodId)
              ? entry.foodId
              : null,
            entry.name,
            entry.serving,
            entry.quantity,
            entry.calories,
            entry.date,
          ],
        );
      }

      await client.query(
        `insert into app_settings (id, active_profile_id, updated_at)
         values (1, $1, now())
         on conflict (id)
         do update set active_profile_id = excluded.active_profile_id,
                       updated_at = now()`,
        [activeProfileId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database write failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
