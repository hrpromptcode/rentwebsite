import { and, desc, eq, media } from "@rentweb/db";
import { adminState, anyToast, done, go, hreq, launch, newCtx, newPage, out, shot, tenantIdOf, tt } from "./admin_b2-lib";

const SLUG = process.argv[2] ?? "demo-shop";
function pngPad(size: number, base: Buffer): Buffer { return Buffer.concat([base, Buffer.alloc(Math.max(0, size - base.length), 0)]); }
async function main() {
  const tid = await tenantIdOf(SLUG);
  const browser = await launch();
  const ctx = await newCtx(browser, { storageState: await adminState(browser) });
  const page = await newPage(ctx);
  await go(page, `/t/${SLUG}/media`);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 200, height: 120 } });
  const jpg = await page.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 200, height: 120 } });
  const webpB64 = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; const g = c.getContext("2d")!; g.fillStyle = "#c33"; g.fillRect(0, 0, 64, 64); return c.toDataURL("image/webp").split(",")[1]; });
  const webp = Buffer.from(webpB64!, "base64");
  const files: Record<string, { name: string; mimeType: string; buffer: Buffer }[]> = {
    jpg: [{ name: "qa-b2.jpg", mimeType: "image/jpeg", buffer: jpg }],
    png: [{ name: "qa-b2.png", mimeType: "image/png", buffer: png }],
    webp: [{ name: "qa-b2.webp", mimeType: "image/webp", buffer: webp }],
    svg: [{ name: "qa-b2.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>') }],
    htmlAsJpg: [{ name: "evil.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html><script>alert(1)</script></html>") }],
    txt: [{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }],
    over11mb: [{ name: "big11.png", mimeType: "image/png", buffer: pngPad(11 * 1024 * 1024, png) }],
    over13mb: [{ name: "big13.png", mimeType: "image/png", buffer: pngPad(13 * 1024 * 1024, png) }],
    two7mb: [{ name: "a7.png", mimeType: "image/png", buffer: pngPad(7 * 1024 * 1024, png) }, { name: "b7.png", mimeType: "image/png", buffer: pngPad(7 * 1024 * 1024, png) }],
  };
  const results: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(files)) {
    const before = (await tt(tid, (tx) => tx.select({ id: media.id }).from(media).where(eq(media.tenantId, tid)))).length;
    const t = await anyToast(page, () => page.locator('input[type="file"]').setInputFiles(f), 90_000);
    await page.waitForTimeout(800);
    const after = await tt(tid, (tx) => tx.select().from(media).where(eq(media.tenantId, tid)).orderBy(desc(media.createdAt)).limit(3));
    const all = (await tt(tid, (tx) => tx.select({ id: media.id }).from(media).where(eq(media.tenantId, tid)))).length;
    results[k] = { toast: t, added: all - before, newest: all > before ? { url: after[0]!.url, mime: after[0]!.mime } : null };
    out(k, results[k]);
    await page.reload({ waitUntil: "networkidle" });
  }
  // check uploaded files served by storefront
  for (const k of ["jpg", "png", "webp"]) {
    const u = (results[k] as any)?.newest?.url as string | undefined;
    if (!u) continue;
    const r = await hreq(`${SLUG}.localhost:3000`, u);
    out(`storefront GET ${k}`, { url: u, status: r.status, ct: r.headers["content-type"] });
  }
  await page.screenshot({ path: shot(`media-${SLUG}`) });
  out("hint copy", await page.locator("text=รองรับ JPG").first().innerText().catch(() => ""));
  out("errors", page.__errors.slice(0, 6));
  await browser.close();
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
