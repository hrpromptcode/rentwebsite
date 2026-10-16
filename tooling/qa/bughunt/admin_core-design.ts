import path from "node:path";
import zlib from "node:zlib";
import { eq, getAdminDb, tenants } from "@rentweb/db";
import { SHOTS, fetchTenant, goto, launch, login, newPage, out, readCreds, toast, lastToasts, waitFor } from "./admin_core-lib";

const db = getAdminDb();
const creds = readCreds() as any;
const SLUG = process.argv[2] ?? (creds.tenants as any[]).find((t) => t.key === "shop").slug;
const HOST = `${SLUG}.localhost:3000`;
const theme = async () => ((await db.select().from(tenants).where(eq(tenants.slug, SLUG)))[0]!.theme as any);

export function png(w: number, h: number, extra = 0): Buffer {
  const crcT = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x55);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw))];
  if (extra) parts.push(chunk("tEXt", Buffer.alloc(extra, 0x41)));
  parts.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

async function pick(page: any, label: string, optionRe: RegExp) {
  const trigger = page.locator("div.grid.gap-2").filter({ has: page.locator(`label:text-is("${label}")`) }).locator("button[role=combobox]").first();
  await trigger.click();
  const lb = page.locator("[role=listbox]").last();
  await lb.waitFor();
  const opts = lb.locator("[role=option]");
  const texts: string[] = await opts.allInnerTexts();
  let i = texts.findIndex((t) => optionRe.test(t) && !/ตาม preset/.test(t));
  if (i < 0) i = 1;
  await opts.nth(i).click();
  return texts[i];
}

async function save(page: any) {
  return toast(page, /บันทึก|ไม่ถูกต้อง|ผิดพลาด|ไม่สำเร็จ|Invalid/, () => page.getByRole("button", { name: /บันทึกและเผยแพร่/ }).click());
}

async function main() {
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await newPage(ctx);
  await login(page, creds.owner.email, creds.owner.password);
  const orig = await theme();
  out("orig theme", orig);
  const sf0 = await fetchTenant(HOST, "/");
  out("storefront html tag", /<html[^>]*>/.exec(sf0.body)?.[0]);

  await goto(page, `/t/${SLUG}/design`);
  const STEPS = (process.argv[3] ?? "1,2,3,4,5").split(",");
  if (STEPS.includes("1")) {
  // 1. preset
  const presetBtns = page.locator("button[aria-pressed]");
  const n = await presetBtns.count();
  let chosen = "";
  for (let i = 0; i < n; i++) {
    if ((await presetBtns.nth(i).getAttribute("aria-pressed")) === "false") {
      chosen = (await presetBtns.nth(i).innerText()).split("\n")[0]!;
      await presetBtns.nth(i).click();
      break;
    }
  }
  const iframeSrc0 = await page.locator("iframe").getAttribute("src");
  const t1 = await save(page);
  const th1 = await theme();
  const ms1 = await waitFor(async () => (await fetchTenant(HOST, "/")).body.includes(`preset-${th1.preset}`), 90_000);
  out("preset", { chosen, toast: t1, dbPreset: th1.preset, storefrontMs: ms1, iframeSrcBefore: iframeSrc0, iframeSrcAfter: await page.locator("iframe").getAttribute("src") });

  }
  if (STEPS.includes("2")) {
  // 2. colors + contrast warning (live)
  await page.getByRole("tab", { name: "สี" }).click();
  await page.locator("#color-primary").fill("#E11D48");
  await page.locator("#color-background").fill("#FFFFFF");
  await page.locator("#color-foreground").fill("#EEEEEE");
  await page.waitForTimeout(500);
  const warnText = (await page.locator("div").filter({ hasText: /คอนทราสต์ต่ำ/ }).last().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  out("contrast live warning", { warnText });
  const t2 = await save(page);
  const th2 = await theme();
  const ms2 = await waitFor(async () => /--primary:\s*#e11d48/i.test((await fetchTenant(HOST, "/")).body), 90_000);
  out("colors saved", { toast: t2, colors: th2.colors, storefrontMs: ms2 });
  for (const k of ["foreground", "background"]) {
    const row = page.locator("div.grid.gap-2").filter({ has: page.locator(`label[for=color-${k}]`) });
    await row.getByRole("button", { name: /ใช้ค่า preset/ }).click().catch(() => {});
  }
  // invalid color text
  await page.locator("#color-accent").fill("notacolor");
  const t2b = await save(page).catch((e) => `ERR ${e.message}`);
  out("invalid color", { toast: t2b, accent: (await theme()).colors?.accent });

  }
  if (STEPS.includes("3")) {
  // 3. fonts + layout
  await page.getByRole("tab", { name: "ฟอนต์" }).click();
  const fh = await pick(page, "ฟอนต์หัวข้อ", /Mitr/);
  await page.getByRole("tab", { name: "เลย์เอาต์" }).click();
  const bs = await pick(page, "สไตล์ปุ่ม", /แคปซูล|pill/i);
  const cs = await pick(page, "สไตล์การ์ด", /เส้นขอบ|outlined/i);
  await page.screenshot({ path: path.join(SHOTS, "bughunt-admin_core-design-layout.png") });
  out("dirty?", await page.locator("div.sticky p").last().innerText());
  const t3 = await save(page);
  const th3 = await theme();
  await new Promise((r) => setTimeout(r, 65_000));
  const sf3 = await fetchTenant(HOST, "/");
  out("fonts/layout", { fh, bs, cs, toast: t3, fonts: th3.fonts, layout: th3.layout, html: /<html[^>]*>/.exec(sf3.body)?.[0]?.slice(0, 500) });

  }
  if (STEPS.includes("4")) {
  // 4. brand uploads
  await page.getByRole("tab", { name: "แบรนด์" }).click();
  const logoInput = page.locator("div.grid.gap-2").filter({ has: page.locator("label[for=brand-logo]") }).locator("input[type=file]");
  const up1 = await toast(page, /อัปโหลด|รองรับ|ใหญ่|ไม่สำเร็จ|exceeded|limit/i, () => logoInput.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png(160, 80) }));
  const logoVal = await page.locator("#brand-logo").inputValue();
  const upTxt = await toast(page, /รองรับเฉพาะ|ไม่สำเร็จ|อัปโหลดแล้ว/, () => logoInput.setInputFiles({ name: "evil.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }));
  const upBig = await toast(page, /ใหญ่เกิน|ไม่สำเร็จ|exceeded|limit|อัปโหลดแล้ว|Body|error/i, () => logoInput.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: png(10, 10, Math.round(10.5 * 1024 * 1024)) }), 90_000).catch((e) => `ERR ${e.message}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(document.domain)</script></svg>`;
  const upSvg = await toast(page, /อัปโหลด|รองรับ/, () => logoInput.setInputFiles({ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) }));
  const svgVal = await page.locator("#brand-logo").inputValue();
  await page.locator("#brand-logo").fill(logoVal);
  const t4 = await save(page);
  const th4 = await theme();
  const ms4 = await waitFor(async () => (await fetchTenant(HOST, "/")).body.includes(logoVal), 90_000);
  const logoFetch = await fetchTenant(HOST, logoVal);
  const svgFetch = await fetchTenant(HOST, svgVal);
  out("brand", { up1, logoVal, upTxt, upBig, upSvg, svgVal, toast: t4, brand: th4.brand, storefrontMs: ms4, logoStatus: logoFetch.status, svgStatus: svgFetch.status, svgCT: svgFetch.headers["content-type"] });
  await page.screenshot({ path: path.join(SHOTS, "bughunt-admin_core-design-brand.png") });

  }
  // 5. custom css on trial
  await page.getByRole("tab", { name: "CSS" }).click();
  const taDisabled = await page.locator("textarea").first().isDisabled();
  out("css on trial", { textareaDisabled: taDisabled });
  out("errors", page.__errors.slice(0, 8));
  out("toasts", await lastToasts(page));
  await browser.close();
  process.exit(0);
}
if (process.argv[1]?.includes("admin_core-design")) main().catch((e) => {
  console.error(e);
  process.exit(1);
});
