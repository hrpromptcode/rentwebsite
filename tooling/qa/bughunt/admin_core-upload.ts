import path from "node:path";
import { SHOTS, goto, launch, login, newPage, out, readCreds } from "./admin_core-lib";
import { png } from "./admin_core-design";

const creds = readCreds() as any;
const SLUG = process.argv[2] ?? "ac-shop-vcre";
const MODE = process.argv[3] ?? "all";

async function watch(page: any, label: string, action: () => Promise<unknown>, waitMs = 90_000) {
  const posts: string[] = [];
  const onResp = (r: any) => {
    if (r.request().method() === "POST") posts.push(`${r.status()} ${r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}`);
  };
  const onFail = (r: any) => {
    if (r.method() === "POST") posts.push(`FAILED ${r.failure()?.errorText}`);
  };
  page.on("response", onResp);
  page.on("requestfailed", onFail);
  const t0 = Date.now();
  await action();
  const seen = new Set<string>();
  const pre = new Set((await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])).map((t: string) => t.replace(/s+/g, " ")));
  while (Date.now() - t0 < waitMs) {
    for (const t of await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])) seen.add(t.replace(/\s+/g, " "));
    if (posts.length && seen.size) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  for (const t of await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])) seen.add(t.replace(/\s+/g, " "));
  page.off("response", onResp);
  page.off("requestfailed", onFail);
  out(label, { ms: Date.now() - t0, posts, toasts: [...seen], errors: page.__errors.splice(0).slice(0, 4) });
  // dismiss toasts
  await page.waitForTimeout(6000);
}

async function main() {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await newPage(ctx);
  await login(page, creds.owner.email, creds.owner.password);
  if (MODE === "all" || MODE === "brand" || MODE === "small") {
    await goto(page, `/t/${SLUG}/design`);
    await page.getByRole("tab", { name: "แบรนด์" }).click();
    const logoInput = page.locator("div.grid.gap-2").filter({ has: page.locator("label[for=brand-logo]") }).locator("input[type=file]");
    await watch(page, "brand 10.5MB png", () => logoInput.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: png(10, 10, Math.round(10.5 * 1024 * 1024)) }));
    await watch(page, "brand 9.5MB png", () => logoInput.setInputFiles({ name: "nine.png", mimeType: "image/png", buffer: png(10, 10, Math.round(9.5 * 1024 * 1024)) }));
    await watch(page, "brand txt", () => logoInput.setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }));
  }
  if (MODE === "all" || MODE === "media") {
    await goto(page, `/t/${SLUG}/media`);
    const input = page.locator("input[type=file]");
    await watch(page, "media jpg+webp small", () =>
      input.setInputFiles([
        { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]) },
        { name: "b.webp", mimeType: "image/webp", buffer: Buffer.concat([Buffer.from("RIFF"), Buffer.from([26, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(14)]) },
      ]),
    );
    await watch(page, "media 3 x 4MB png (12MB total)", () =>
      input.setInputFiles([1, 2, 3].map((i) => ({ name: `photo${i}.png`, mimeType: "image/png", buffer: png(10, 10, 4 * 1024 * 1024) }))),
    );
    await watch(page, "media 11MB png", () => input.setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: png(10, 10, 11 * 1024 * 1024) }));
    await watch(page, "media .exe", () => input.setInputFiles({ name: "x.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") }));
    await watch(page, "media html renamed .png", () => input.setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<html><script>alert(1)</script></html>") }));
    await page.screenshot({ path: path.join(SHOTS, "bughunt-admin_core-media.png") });
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
