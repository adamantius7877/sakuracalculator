import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual route code with an isolated database stub, without a live database.
function loadRoute(relativePath, database) {
  const filename = new URL(relativePath, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const realRequire = createRequire(import.meta.url);
  const context = vm.createContext({
    exports: module.exports, module, Request, Response, URL, process,
    require: (name) => name === "@/lib/server/db" ? database : realRequire(name),
  });
  vm.runInContext(compiled, context, { filename: filename.pathname });
  return module.exports;
}

test("shared foods API filters, advertises, and upserts the Side type", async () => {
  const rows = [{ id: "s-1", name: "Rice", type: "side", calories: 200, serving: "One cup", servings: 2, ingredients: "Rice" }];
  const queries = [];
  const route = loadRoute("../app/api/foods/route.ts", {
    hasDatabaseUrl: () => true,
    getPool: () => ({ query: async (sql, values) => {
      queries.push({ sql, values });
      return { rows };
    } }),
  });
  const listed = await route.GET(new Request("http://localhost/api/foods?type=side"));
  assert.equal(listed.status, 200);
  const body = await listed.json();
  assert.ok(body.supportedTypes.includes("side"));
  assert.equal(body.foods[0].type, "side");
  assert.equal(queries[0].values[0], "side");
  assert.match(queries[0].sql, /where type = \$1/);
  const saved = await route.POST(new Request("http://localhost/api/foods", {
    method: "POST", body: JSON.stringify(rows[0]),
  }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).food.type, "side");
  assert.equal(queries[1].values[2], "side");
});

test("dashboard state saves Side foods without converting them to meals", async () => {
  const queries = [];
  const route = loadRoute("../app/api/state/route.ts", {
    hasDatabaseUrl: () => true,
    getPool: () => ({ connect: async () => ({
      query: async (sql, values) => { queries.push({ sql, values }); return { rows: [] }; },
      release() {},
    }) }),
  });
  const result = await route.PUT(new Request("http://localhost/api/state", {
    method: "PUT", body: JSON.stringify({
      profiles: [{ id: "p-1", name: "Test profile", profile: {} }], activeProfileId: "p-1",
      foods: [{ id: "s-1", name: "Rice", type: "side", calories: 200 }], log: [],
    }),
  }));
  assert.equal(result.status, 200);
  const insert = queries.find((query) => /insert into foods/.test(query.sql));
  assert.equal(insert.values[2], "side");
});
