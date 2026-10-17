import "../../../load-env";
import { chromium } from "@playwright/test";
async function main() {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const r = await ctx.request.get("http://127.0.0.1:3000/api/restaurant/session/ZZZZZZ", { headers: { host: "demo-restaurant.localhost:3000" } });
  console.log("override host ->", r.status(), (await r.text()).slice(0, 120));
  const r2 = await ctx.request.get("http://127.0.0.1:3000/api/restaurant/session/ZZZZZZ");
  console.log("no host ->", r2.status(), (await r2.text()).slice(0, 80));
  await b.close();
}
main();
