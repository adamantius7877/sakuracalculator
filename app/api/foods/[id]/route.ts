import { getPool, hasDatabaseUrl } from "@/lib/server/db";

export const runtime = "nodejs";

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
        "access-control-allow-methods": "DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
      }
    : {};
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasDatabaseUrl()) {
    return Response.json(
      { configured: false, error: "DATABASE_URL is not configured." },
      { status: 503, headers: corsHeaders(request) },
    );
  }

  const { id } = await params;

  try {
    await getPool().query("delete from foods where id = $1", [id]);
    return Response.json({ ok: true }, { headers: corsHeaders(request) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Food removal failed.";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders(request) });
  }
}
