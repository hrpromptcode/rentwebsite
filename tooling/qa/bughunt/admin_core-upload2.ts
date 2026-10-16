import { goto, launch, login, newPage, out, readCreds } from "./admin_core-lib";

const creds = readCreds() as any;
const SLUG = process.argv[2] ?? "ac-shop-vcre";

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

async function watch(page: any, label: string, action: () => Promise<unknown>, waitMs = 60_000) {
  const posts: string[] = [];
  const onResp = (r: any) => {
    if (r.request().method() === "POST") posts.push(`${r.status()}`);
  };
  page.on("response", onResp);
  const pre = new Set<string>(((await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])) as string[]).map(norm));
  const t0 = Date.now();
  await action();
  const seen = new Set<string>();
  while (Date.now() - t0 < waitMs) {
    for (const t of (await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [])) as string[]) if (!pre.has(norm(t))) seen.add(norm(t));
    if (posts.length && seen.size) break;
    await page.waitForTimeout(500);
  }
  page.off("response", onResp);
  out(label, { ms: Date.now() - t0, posts, toasts: [...seen], errors: page.__errors.splice(0).filter((e: string) => !/404/.test(e)).slice(0, 4) });
  await page.waitForTimeout(5000);
}

async function main() {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await newPage(ctx);
  await login(page, creds.owner.email, creds.owner.password);
  await goto(page, `/t/${SLUG}/design`);
  await page.getByRole("tab", { name: "แบรนด์" }).click();
  const logoInput = page.locator("div.grid.gap-2").filter({ has: page.locator("label[for=brand-logo]") }).locator("input[type=file]");
  await watch(page, "brand txt", () => logoInput.setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }));
  await goto(page, `/t/${SLUG}/media`);
  const input = page.locator("input[type=file]");
  await watch(page, "media .exe", () => input.setInputFiles({ name: "x.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") }));
  await watch(page, "media html renamed .png", () => input.setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<html><script>alert(1)</script></html>") }));
  await watch(page, "media svg with script", () => input.setInputFiles({ name: "s.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }));
  await browser.close();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
