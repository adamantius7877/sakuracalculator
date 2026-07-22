import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the calorie dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Calorie Counter Dashboard<\/title>/i);
  assert.match(html, /Track meals and calculate a realistic weight-loss target/);
  assert.match(html, /User Profiles/);
  assert.match(html, /Active profile/);
  assert.match(html, /Body Profile/);
  assert.match(html, /Food Library/);
  assert.match(html, /USDA Food Lookup/);
  assert.match(html, /Published Google Sheet CSV URL/);
  assert.match(html, /Trans woman/);
  assert.match(html, /Trans man/);
  assert.match(html, /Mifflin-St Jeor/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|react-loading-skeleton/i);
});
