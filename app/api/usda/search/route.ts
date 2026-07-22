export const runtime = "nodejs";

export async function GET(request: Request) {
  const apiKey = process.env.FDC_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error:
          "FDC_API_KEY is not configured on the server. USDA search is disabled.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();

  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "8");
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS),Branded");

  const response = await fetch(url);

  if (!response.ok) {
    return Response.json(
      { error: "USDA FoodData Central search failed." },
      { status: response.status },
    );
  }

  return Response.json(await response.json());
}
