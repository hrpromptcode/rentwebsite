/** reverify-repro: commerce sanitizeHtml lets an unterminated tag through; SSR places it before "</div>", which closes it. */
import { chromium } from "@playwright/test";
import { sanitizeHtml } from "../../../../packages/modules/commerce/src/lib/sanitize";
async function main() {
  const out = sanitizeHtml("<p>ok</p><img src=x onerror=window.__x=1 x=");
  const html = `<!doctype html><html><body><div class="prose">${out}</div><p>after</p></body></html>`; // what SSR emits
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.waitForTimeout(500);
  const x = await p.evaluate(() => (window as unknown as { __x?: number }).__x ?? 0);
  console.log("sanitizeHtml output:", JSON.stringify(out));
  console.log(x ? "FAIL onerror handler executed in SSR context (stored XSS)" : "PASS no script execution");
  await b.close();
  process.exit(x ? 1 : 0);
}
main();
