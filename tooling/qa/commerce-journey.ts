import "../load-env";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, type Browser, type Page } from "@playwright/test";
import { getStock } from "./stock";
import { orderState } from "./order-state";

/**
 * Independent QA journey for the commerce module (round 1), run for real in Chromium.
 *   MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/commerce-journey.ts [demo-shop|demo-cafe]
 * Prints PASS/FAIL per step; screenshots failing steps to tooling/screenshots/qa-fail-*.png.
 * Requires the web dev server on http://localhost:3000 and DEV_AUTO_APPROVE_SLIPS=true.
 */
const port = process.env.PORT ?? "3000";
const outDir = path.resolve(process.cwd(), "screenshots");
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

type TenantCfg = {
  slug: string;
  productSlug: string;
  variant: string | null; // option value (S/M/L/XL) or null
  variantSku: string | null;
  codVariant: string | null;
  codVariantSku: string | null;
  cheapestName: string;
  categoryChip: string;
  categoryCount: number;
  searchTerm: string;
  shippingLabel: string; // non-COD shipping to click
  shippingFee: string; // expected visible fee text
  codLabel: string | null; // COD shipping label (null = not seeded)
  coupons: { welcome: boolean; freeship: boolean };
};

const CFG: Record<string, TenantCfg> = {
  "demo-shop": {
    slug: "demo-shop",
    productSlug: "linen-shirt-sand",
    variant: "M",
    variantSku: "LINEN-SHIRT-SAND-M",
    codVariant: "L",
    codVariantSku: "LINEN-SHIRT-SAND-L",
    cheapestName: "ปลอกหมอนผ้าฝ้ายทอ",
    categoryChip: "กระเป๋า",
    categoryCount: 2,
    searchTerm: "ลินิน",
    shippingLabel: "Kerry Express",
    shippingFee: "฿60",
    codLabel: "เก็บเงินปลายทาง (COD)",
    coupons: { welcome: true, freeship: true },
  },
  "demo-cafe": {
    slug: "demo-cafe",
    productSlug: "croissant",
    variant: null,
    variantSku: null,
    codVariant: null,
    codVariantSku: null,
    cheapestName: "ครัวซองต์เนยฝรั่งเศส",
    categoryChip: "เค้ก",
    categoryCount: 3,
    searchTerm: "ครัวซองต์",
    shippingLabel: "ส่ง Grab/Lalamove ในกรุงเทพฯ",
    shippingFee: "฿80",
    codLabel: null,
    coupons: { welcome: false, freeship: false },
  },
};

const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const results: Array<{ tenant: string; step: string; ok: boolean; note?: string }> = [];
const current: { tenant: string; page: Page | null } = { tenant: "", page: null };

async function step(name: string, fn: () => Promise<string | void>) {
  const t0 = Date.now();
  try {
    const note = (await fn()) ?? undefined;
    results.push({ tenant: current.tenant, step: name, ok: true, note });
    console.log(`PASS  [${current.tenant}] ${name}${note ? ` — ${note}` : ""} (${Date.now() - t0}ms)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0]!.slice(0, 300) : String(e);
    results.push({ tenant: current.tenant, step: name, ok: false, note: msg });
    console.log(`FAIL  [${current.tenant}] ${name} — ${msg}`);
    if (current.page) {
      const file = path.join(outDir, `qa-fail-${current.tenant}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
      await current.page.screenshot({ path: file, fullPage: false }).catch(() => {});
      console.log(`      screenshot -> ${path.relative(process.cwd(), file)}`);
    }
  }
}

function url(slug: string, p: string) {
  return `http://${slug}.localhost:${port}${p}`;
}

async function newPage(browser: Browser, slug: string, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "th-TH" });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  (page as any).__slug = slug;
  return { ctx, page, errors };
}

const goto = (page: Page, p: string) => page.goto(url((page as any).__slug, p), { waitUntil: "networkidle", timeout: 120_000 });
const txt = async (loc: ReturnType<Page["locator"]>) => ((await loc.textContent()) ?? "").replace(/\s+/g, " ").trim();
async function poll(fn: () => Promise<boolean>, timeoutMs = 15_000, every = 300): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, every));
  }
  return false;
}
const headerBadge = async (page: Page) => txt(page.locator('header a[href="/cart"]').first());

async function fillAddress(page: Page, phone: string, email = "") {
  await page.fill("#name", "คุณทดสอบ ระบบ");
  await page.fill("#phone", phone);
  if (email) await page.fill("#email", email);
  await page.fill("#line1", "99/1 หมู่บ้านทดสอบ ถนนสุขุมวิท");
  await page.fill("#subdistrict", "คลองเตย");
  await page.fill("#district", "คลองเตย");
  await page.selectOption("#province", "กรุงเทพมหานคร");
  await page.fill("#postalCode", "10110");
}

async function visibleSubmit(page: Page) {
  const btns = page.locator('button[type="submit"]', { hasText: "สั่งซื้อและชำระเงิน" });
  const n = await btns.count();
  for (let i = 0; i < n; i++) if (await btns.nth(i).isVisible()) return btns.nth(i);
  throw new Error("no visible place-order button");
}

async function clickVisible(page: Page, name: string) {
  const btns = page.getByRole("button", { name });
  const n = await btns.count();
  for (let i = 0; i < n; i++) {
    if (await btns.nth(i).isVisible()) {
      const box = await btns.nth(i).boundingBox();
      await btns.nth(i).click();
      return box;
    }
  }
  throw new Error(`no visible button "${name}"`);
}

async function runTenant(browser: Browser, cfg: TenantCfg) {
  const slug = cfg.slug;
  current.tenant = slug;
  const phone = `08${String(Date.now()).slice(-8)}`;
  const { ctx, page, errors } = await newPage(browser, slug);
  current.page = page;
  let orderUrl = "";
  let orderNumber = "";
  const stockBefore = await getStock(slug, cfg.productSlug, cfg.variantSku);
  const codStockBefore = cfg.codVariantSku ? await getStock(slug, cfg.productSlug, cfg.codVariantSku) : null;

  // ---------------- 1. listing ----------------
  await step("1a /products lists real products", async () => {
    await goto(page, "/products");
    const cards = page.locator('article a[href^="/products/"]');
    const n = await cards.count();
    if (n < 4) throw new Error(`only ${n} product links`);
    const count = await txt(page.locator("p[aria-live=polite]").first());
    if (!/\d+ รายการ/.test(count)) throw new Error(`results text missing: "${count}"`);
    const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).length);
    return `${n} cards, "${count}", broken images=${broken}`;
  });
  await step("1b category chips navigate", async () => {
    // pills carry a count badge ("กระเป๋า 2"), so match by href prefix + text and take the visible one (header mega-menu has hidden duplicates)
    const chip = page.locator('a[href^="/collections/"]', { hasText: cfg.categoryChip }).filter({ visible: true }).first();
    await chip.click();
    await page.waitForURL(/\/collections\//, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const count = await txt(page.locator("p[aria-live=polite]").first());
    if (!count.startsWith(`${cfg.categoryCount} รายการ`)) throw new Error(`expected ${cfg.categoryCount} รายการ, got "${count}" at ${page.url()}`);
    const active = page.locator('a[aria-current="page"]');
    if (!(await active.count())) throw new Error("no aria-current chip on collection page");
    return `${page.url().replace(/^https?:\/\/[^/]+/, "")} -> ${count}`;
  });
  await step("1c sort select auto-submits (price_asc)", async () => {
    await goto(page, "/products");
    await page.selectOption('select[name="sort"]', "price_asc");
    await page.waitForURL(/sort=price_asc/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const first = await txt(page.locator("article").first());
    if (!first.includes(cfg.cheapestName)) throw new Error(`first card after price_asc is "${first.slice(0, 60)}"`);
    return `first card = ${cfg.cheapestName}`;
  });
  await step("1d search filters", async () => {
    await goto(page, "/products");
    await page.fill('input[name="q"]', cfg.searchTerm);
    await page.keyboard.press("Enter");
    await page.waitForURL(/[?&]q=/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    const count = await txt(page.locator("p[aria-live=polite]").first());
    const n = await page.locator("article").count();
    if (n < 1) throw new Error("no results for search");
    const clear = page.getByRole("link", { name: /ล้างตัวกรอง/ });
    if (!(await clear.count())) throw new Error("clear-filters link missing while filtered");
    return `${count}, ${n} card(s)`;
  });
  await step("1e pagination / out-of-range page", async () => {
    await goto(page, "/products");
    const nav = page.locator('nav[aria-label="pagination"]');
    const total = await txt(page.locator("p[aria-live=polite]").first());
    const hasNav = await nav.count();
    await goto(page, "/products?page=2");
    const body = await txt(page.locator("main, body").first());
    const emptyCatalogMsg = body.includes("ยังไม่มีสินค้าในร้าน");
    return `${total}, pagination nav rendered=${!!hasNav} (expected none for <=24 items); ?page=2 shows "ยังไม่มีสินค้าในร้าน"=${emptyCatalogMsg}`;
  });

  // ---------------- 2. product + add to cart ----------------
  await step("2a product page renders buy box", async () => {
    await goto(page, `/products/${cfg.productSlug}`);
    const h1 = await txt(page.locator("h1").first());
    if (!h1) throw new Error("no h1");
    const add = page.getByRole("button", { name: "เพิ่มลงตะกร้า" });
    if (!(await add.count())) throw new Error("add-to-cart button missing");
    if (cfg.variant) {
      const opts = page.locator("button[aria-pressed]");
      const labels = await opts.allTextContents();
      if (!["S", "M", "L", "XL"].every((s) => labels.includes(s))) throw new Error(`variant buttons = ${labels.join(",")}`);
    }
    const qr = await page.locator('button[aria-label="เพิ่มจำนวน"]').first().boundingBox();
    if (!qr || qr.height < 44 || qr.width < 44) throw new Error(`qty button ${qr?.width}x${qr?.height} < 44px`);
    return `"${h1.slice(0, 40)}"${cfg.variant ? ", S/M/L/XL present" : ""}`;
  });
  await step("2b pick variant + qty 2 + add -> toast + badge", async () => {
    if (cfg.variant) {
      await page.locator("button[aria-pressed]", { hasText: new RegExp(`^${cfg.variant}$`) }).first().click();
      const pressed = await page.locator("button[aria-pressed=true]").allTextContents();
      if (!pressed.includes(cfg.variant)) throw new Error(`variant not selected: ${pressed}`);
    }
    const plus = page.locator('button[aria-label="เพิ่มจำนวน"]').first();
    await plus.click();
    const qty = await page.locator('input[aria-label="จำนวน"]').first().inputValue();
    if (qty !== "2") throw new Error(`qty is ${qty}`);
    await clickVisible(page, "เพิ่มลงตะกร้า");
    const toast = page.getByText("เพิ่มลงตะกร้าแล้ว").first();
    await toast.waitFor({ state: "visible", timeout: 10_000 });
    const okBadge = await poll(async () => (await headerBadge(page)) === "2");
    if (!okBadge) throw new Error(`header badge = "${await headerBadge(page)}" (expected 2)`);
    return "toast shown, header badge = 2";
  });

  // ---------------- 3. cart ----------------
  await step("3a /cart shows line + qty stepper works", async () => {
    await goto(page, "/cart");
    const qtyInput = page.locator('input[aria-label="จำนวน"]').first();
    if ((await qtyInput.inputValue()) !== "2") throw new Error(`cart qty = ${await qtyInput.inputValue()}`);
    const line = page.locator(".card", { has: page.locator('input[aria-label="จำนวน"]') }).first();
    const before = await txt(line);
    if (cfg.variant && !before.includes(cfg.variant)) throw new Error(`variant title "${cfg.variant}" not in line: ${before.slice(0, 80)}`);
    await page.locator('button[aria-label="เพิ่มจำนวน"]').first().click();
    const up = await poll(async () => (await qtyInput.inputValue()) === "3");
    if (!up) throw new Error("qty did not go to 3");
    await page.waitForLoadState("networkidle");
    await page.locator('button[aria-label="ลดจำนวน"]').first().click();
    const down = await poll(async () => (await qtyInput.inputValue()) === "2");
    if (!down) throw new Error("qty did not go back to 2");
    await page.waitForLoadState("networkidle");
    const subtotal = await txt(page.locator("dl").first());
    return `line qty 2->3->2 OK; summary: ${subtotal.slice(0, 80)}`;
  });
  const applyCoupon = async (code: string) => {
    await page.fill("#coupon", code);
    await page.getByRole("button", { name: "ใช้โค้ด" }).click();
    await page.waitForLoadState("networkidle");
  };
  const couponErr = () => txt(page.locator("form p.text-destructive").first());
  const couponApplied = () => poll(async () => (await page.locator('button[aria-label="ยกเลิกโค้ด"]').count()) > 0, 8000);
  const removeCoupon = async () => {
    await page.locator('button[aria-label="ยกเลิกโค้ด"]').click();
    await poll(async () => (await page.locator("#coupon").count()) > 0, 8000);
  };
  await step("3b coupon WELCOME10 applies (10%, cap 300)", async () => {
    await applyCoupon("WELCOME10");
    const applied = await couponApplied();
    if (!cfg.coupons.welcome) {
      if (applied) throw new Error("WELCOME10 applied but it is not seeded for this tenant");
      return `N/A — not seeded for ${slug}; UI error shown: "${await couponErr()}"`;
    }
    if (!applied) throw new Error(`not applied; error="${await couponErr()}"`);
    const dl = await txt(page.locator("dl").first());
    if (!dl.includes("ส่วนลด")) throw new Error(`no discount row: ${dl}`);
    const m = dl.match(/ส่วนลด\s*[−-]?฿([\d,]+)/);
    await removeCoupon();
    return `discount row "${m?.[0] ?? dl.slice(0, 60)}", removed again OK`;
  });
  await step("3c coupon FREESHIP applies (shipping = free)", async () => {
    await applyCoupon("FREESHIP");
    const applied = await couponApplied();
    if (!cfg.coupons.freeship) {
      if (applied) throw new Error("FREESHIP applied but it is not seeded for this tenant");
      return `N/A — not seeded for ${slug}; UI error shown: "${await couponErr()}"`;
    }
    if (!applied) throw new Error(`not applied; error="${await couponErr()}"`);
    const dl = await txt(page.locator("dl").first());
    if (!/ค่าจัดส่ง\s*ส่งฟรี/.test(dl)) throw new Error(`shipping row not free: ${dl}`);
    await removeCoupon();
    return "shipping row shows ส่งฟรี, removed again OK";
  });
  await step("3d invalid coupon shows error", async () => {
    await applyCoupon("NOPE-999");
    const err = page.locator("form p.text-destructive").first();
    await err.waitFor({ state: "visible", timeout: 8000 });
    const t = await txt(err);
    if (!t.includes("โค้ดส่วนลดไม่ถูกต้อง")) throw new Error(`error text: "${t}"`);
    return `"${t}"`;
  });
  if (cfg.coupons.welcome) {
    await step("3e leave WELCOME10 applied for checkout", async () => {
      await applyCoupon("WELCOME10");
      if (!(await couponApplied())) throw new Error("could not re-apply WELCOME10");
    });
  }

  // ---------------- 4. checkout ----------------
  await step("4a /checkout renders contact + address + shipping quotes", async () => {
    await page.getByRole("link", { name: /ไปชำระเงิน/ }).first().click();
    await page.waitForURL(/\/checkout/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    for (const id of ["#name", "#phone", "#email", "#line1", "#subdistrict", "#district", "#province", "#postalCode"]) if (!(await page.locator(id).count())) throw new Error(`${id} missing`);
    const radios = page.locator('div[role="radiogroup"][aria-label="วิธีจัดส่ง"] label');
    const n = await radios.count();
    if (n < 2) throw new Error(`only ${n} shipping options`);
    const texts = await radios.allTextContents();
    const priced = texts.filter((t) => /฿[\d,]+|ส่งฟรี/.test(t)).length;
    if (priced !== n) throw new Error(`shipping options without visible price: ${texts.join(" | ")}`);
    const provinces = await page.locator("#province option").count();
    if (provinces < 77) throw new Error(`province select has ${provinces} options`);
    return `${n} shipping options all priced; ${provinces - 1} provinces`;
  });
  await step("4b choose shipping + PromptPay + submit -> /orders/[id]?k=", async () => {
    await page.getByText(cfg.shippingLabel, { exact: true }).first().click();
    const chosen = page.locator('div[role="radiogroup"][aria-label="วิธีจัดส่ง"] label', { hasText: cfg.shippingLabel }).first();
    const chosenText = await txt(chosen);
    if (!chosenText.includes(cfg.shippingFee)) throw new Error(`fee ${cfg.shippingFee} not visible in "${chosenText}"`);
    await fillAddress(page, phone, `qa+${Date.now()}@example.com`);
    await page.getByText("สแกน PromptPay", { exact: true }).first().click();
    const checked = await page.locator('input[name="paymentMethod"]:checked').inputValue();
    if (checked !== "promptpay_qr") throw new Error(`payment radio = ${checked}`);
    const summaryTotal = await txt(page.locator("dl dd.font-heading").first());
    const btn = await visibleSubmit(page);
    await btn.click();
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?k=/, { timeout: 90_000 });
    await page.waitForLoadState("networkidle");
    orderUrl = page.url();
    return `summary total ${summaryTotal} -> ${orderUrl.replace(/^https?:\/\/[^/]+/, "").replace(/k=[^&]+/, "k=...")}`;
  });

  // ---------------- 5. order page + slip ----------------
  await step("5a order page: timeline + PaymentPanel QR", async () => {
    const h1 = await txt(page.locator("h1").first());
    const m = h1.match(/#\d+/);
    if (!m) throw new Error(`h1 "${h1}" has no order number`);
    orderNumber = m[0];
    const timeline = page.locator('ol[aria-label="สถานะคำสั่งซื้อ"]');
    if ((await timeline.locator("li").count()) !== 4) throw new Error("timeline does not have 4 steps");
    const qr = page.locator('img[alt="PromptPay QR"]');
    await qr.waitFor({ state: "visible", timeout: 10_000 });
    const src = (await qr.getAttribute("src")) ?? "";
    if (!src.startsWith("data:image")) throw new Error(`QR src = ${src.slice(0, 30)}`);
    const amount = await txt(page.locator("p.heading-display").first());
    const expiry = await page.getByText(/หมดอายุใน/).count();
    const body = await txt(page.locator("main, body").first());
    const discountOk = !cfg.coupons.welcome || body.includes("WELCOME10");
    if (!discountOk) throw new Error("order summary does not show the WELCOME10 discount");
    return `${orderNumber}, amount ${amount}, countdown=${!!expiry}${cfg.coupons.welcome ? ", WELCOME10 shown" : ""}`;
  });
  await step("5b upload PNG slip -> paid -> order confirmed", async () => {
    const slipPath = path.join(outDir, "_qa-slip.png");
    await writeFile(slipPath, PNG_1x1);
    await page.locator('input[type="file"]').first().setInputFiles(slipPath);
    await page.getByText("ชำระเงินสำเร็จ").first().waitFor({ state: "visible", timeout: 20_000 });
    // panel redirects to successHref (same order page) after ~1.2s; the server-rendered page must now be paid
    const paidBanner = await poll(async () => (await page.getByText("ชำระเงินเรียบร้อย").count()) > 0, 20_000);
    if (!paidBanner) {
      await page.reload({ waitUntil: "networkidle" });
      if (!(await page.getByText("ชำระเงินเรียบร้อย").count())) {
        const st = (await orderState(slug, orderNumber)) as any;
        throw new Error(`paid banner not shown after slip (even after reload). DB: order.status=${st.order?.status} paymentStatus=${st.order?.paymentStatus}; payment.status=${st.payments?.[0]?.status} verifiedBy=${st.payments?.[0]?.verifiedBy}`);
      }
    }
    await page.waitForLoadState("networkidle");
    const body = await txt(page.locator("main, body").first());
    if (!body.includes("ชำระแล้ว")) throw new Error("status badge/timeline does not show ชำระแล้ว");
    if (await page.locator('img[alt="PromptPay QR"]').count()) throw new Error("QR still rendered after payment");
    return "paid banner + ชำระแล้ว shown, QR gone";
  });

  // ---------------- 6. track ----------------
  await step("6 /orders/track finds order by number + phone", async () => {
    const fresh = await ctx.newPage();
    (fresh as any).__slug = slug;
    await goto(fresh, "/orders/track");
    await fresh.fill("#tr-number", orderNumber);
    await fresh.fill("#tr-contact", phone);
    await fresh.getByRole("button", { name: "ค้นหาคำสั่งซื้อ" }).click();
    await fresh.waitForURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 60_000 });
    const h1 = await txt(fresh.locator("h1").first());
    await fresh.close();
    if (!h1.includes(orderNumber)) throw new Error(`landed on "${h1}"`);
    return `-> ${orderNumber}`;
  });
  await step("6b access control: order URL without ?k is not readable", async () => {
    const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await anon.newPage();
    (p2 as any).__slug = slug;
    await goto(p2, orderUrl.replace(/^https?:\/\/[^/]+/, "").replace(/\?k=.*$/, ""));
    const body = await txt(p2.locator("main, body").first());
    await anon.close();
    if (!body.includes("ไม่พบคำสั่งซื้อ")) throw new Error("order page readable without access key or login");
    if (body.includes(orderNumber)) throw new Error("order number leaked without access key");
    return "shows ไม่พบคำสั่งซื้อ";
  });
  await step("6c tenant isolation: same order id + key on another tenant host", async () => {
    const other = slug === "demo-shop" ? "demo-cafe" : "demo-shop";
    const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await anon.newPage();
    (p2 as any).__slug = other;
    const res = await goto(p2, orderUrl.replace(/^https?:\/\/[^/]+/, ""));
    const body = await txt(p2.locator("main, body").first());
    await anon.close();
    if (body.includes(orderNumber) && !body.includes("ไม่พบคำสั่งซื้อ")) throw new Error(`order visible on ${other} (status ${res?.status()})`);
    return `${other} -> ${res?.status()} / ไม่พบคำสั่งซื้อ`;
  });

  // ---------------- 7. COD ----------------
  if (cfg.codLabel) {
    await step("7a COD order: add again, FREESHIP, choose COD shipping", async () => {
      await goto(page, `/products/${cfg.productSlug}`);
      if (cfg.codVariant) await page.locator("button[aria-pressed]", { hasText: new RegExp(`^${cfg.codVariant}$`) }).first().click();
      await clickVisible(page, "เพิ่มลงตะกร้า");
      await page.getByText("เพิ่มลงตะกร้าแล้ว").first().waitFor({ state: "visible", timeout: 10_000 });
      const okBadge = await poll(async () => (await headerBadge(page)) === "1");
      if (!okBadge) throw new Error(`badge after new cart = "${await headerBadge(page)}" (expected 1 — previous cart should be converted)`);
      await goto(page, "/cart");
      if (cfg.coupons.freeship) {
        await applyCoupon("FREESHIP");
        if (!(await couponApplied())) throw new Error("FREESHIP not applied");
      }
      await goto(page, "/checkout");
      await page.getByText(cfg.codLabel!, { exact: true }).first().click();
      const opts = await page.locator('input[name="paymentMethod"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      if (opts.join(",") !== "cod") throw new Error(`payment options with COD shipping = ${opts.join(",")}`);
      const notice = await page.getByText("วิธีจัดส่งนี้ชำระแบบเก็บเงินปลายทางเท่านั้น").count();
      const dl = await txt(page.locator("dl").first());
      return `payment locked to cod, notice=${!!notice}; summary: ${dl.slice(0, 140)}`;
    });
    await step("7b COD submit -> order created, no QR, COD notice", async () => {
      await fillAddress(page, phone);
      const btn = await visibleSubmit(page);
      await btn.click();
      await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?k=/, { timeout: 90_000 });
      await page.waitForLoadState("networkidle");
      if (await page.locator('img[alt="PromptPay QR"]').count()) throw new Error("PromptPay QR rendered for COD order");
      if (await page.locator('input[type="file"]').count()) throw new Error("slip upload rendered for COD order");
      const body = await txt(page.locator("main, body").first());
      if (!body.includes("เก็บเงินปลายทาง")) throw new Error("COD notice missing");
      if (!body.includes("ค่าธรรมเนียมเก็บเงินปลายทาง")) throw new Error("COD fee row missing");
      const h1 = await txt(page.locator("h1").first());
      const badge = body.includes("ยืนยันแล้ว");
      return `${h1.match(/#\d+/)?.[0]}, status ยืนยันแล้ว=${badge}, fee row present`;
    });
  } else {
    results.push({ tenant: slug, step: "7 COD order", ok: true, note: "N/A — tenant seeds no COD shipping method" });
    console.log(`SKIP  [${slug}] 7 COD order — N/A (no cod shipping method seeded)`);
  }

  // ---------------- 8. stock ----------------
  await step("8 stock decremented for bought variant/product", async () => {
    const after = await getStock(slug, cfg.productSlug, cfg.variantSku);
    const key = (cfg.variantSku ? "variant" : "product") as "variant" | "product";
    const b = stockBefore[key] as number;
    const a = after[key] as number;
    if (a !== b - 2) throw new Error(`${cfg.variantSku ?? cfg.productSlug}: before=${b} after=${a} (expected ${b - 2})`);
    let codNote = "";
    if (cfg.codVariantSku && codStockBefore) {
      const codAfter = await getStock(slug, cfg.productSlug, cfg.codVariantSku);
      if (codAfter.variant !== (codStockBefore.variant as number) - 1) throw new Error(`${cfg.codVariantSku}: before=${codStockBefore.variant} after=${codAfter.variant} (expected -1)`);
      codNote = `; ${cfg.codVariantSku} ${codStockBefore.variant}->${codAfter.variant}`;
    }
    const sold = after.soldCount - stockBefore.soldCount;
    return `${cfg.variantSku ?? cfg.productSlug} ${b}->${a}${codNote}; soldCount +${sold} (paid qty 2${cfg.codLabel ? ", COD unpaid not counted" : ""})`;
  });

  // ---------------- mobile sanity ----------------
  await step("M mobile 390px: sticky add bar + checkout sticky submit", async () => {
    const m = await newPage(browser, slug, { width: 390, height: 844 });
    current.page = m.page;
    await goto(m.page, `/products/${cfg.productSlug}`);
    if (cfg.variant) await m.page.locator("button[aria-pressed]", { hasText: new RegExp(`^${cfg.variant}$`) }).first().click();
    // what actually receives a tap at the centre of the visible primary button? (fixed FABs can cover sticky bars)
    const hitTest = async (name: string) => {
      const btns = m.page.getByRole("button", { name });
      for (let i = 0; i < (await btns.count()); i++) {
        if (!(await btns.nth(i).isVisible())) continue;
        const b = (await btns.nth(i).boundingBox())!;
        const hit = await m.page.evaluate(([x, y]) => {
          const el = document.elementFromPoint(x, y) as HTMLElement | null;
          const btn = el?.closest("button, a");
          return { tag: el?.tagName, text: (btn?.textContent ?? el?.textContent ?? "").trim().slice(0, 30), isTarget: !!btn && btn.textContent?.includes(name) };
        }, [b.x + b.width / 2, b.y + b.height / 2] as [number, number]);
        return { box: b, hit };
      }
      throw new Error(`no visible button "${name}"`);
    };
    const add = await hitTest("เพิ่มลงตะกร้า");
    const problems: string[] = [];
    if (!add.hit.isTarget) problems.push(`product sticky bar: tap on "เพิ่มลงตะกร้า" (${Math.round(add.box.width)}x${Math.round(add.box.height)}) lands on <${add.hit.tag}> "${add.hit.text}"`);
    // add via the API-backed button anyway so checkout has a cart (force bypasses the overlay)
    await m.page.getByRole("button", { name: "เพิ่มลงตะกร้า" }).filter({ visible: true }).first().click({ force: true });
    await m.page.getByText("เพิ่มลงตะกร้าแล้ว").first().waitFor({ state: "visible", timeout: 10_000 });
    await goto(m.page, "/checkout");
    const sub = await hitTest("สั่งซื้อและชำระเงิน");
    if (!sub.hit.isTarget) problems.push(`checkout sticky bar: tap on "สั่งซื้อและชำระเงิน" (${Math.round(sub.box.width)}x${Math.round(sub.box.height)}) lands on <${sub.hit.tag}> "${sub.hit.text}"`);
    const sw = await m.page.evaluate(() => document.documentElement.scrollWidth);
    await m.ctx.close();
    current.page = page;
    if (sw > 390) problems.push(`horizontal overflow on /checkout: scrollWidth=${sw}`);
    if (add.box.height < 44 || sub.box.height < 44) problems.push(`tap target < 44px (add ${Math.round(add.box.height)}, submit ${Math.round(sub.box.height)})`);
    if (problems.length) throw new Error(problems.join(" | "));
    return `add ${Math.round(add.box.width)}x${Math.round(add.box.height)} tappable, submit ${Math.round(sub.box.width)}x${Math.round(sub.box.height)} tappable, no overflow`;
  });

  const uniqErrors = [...new Set(errors)];
  results.push({ tenant: slug, step: "console errors during journey", ok: uniqErrors.length === 0, note: uniqErrors.slice(0, 5).join(" || ") || "none" });
  console.log(`${uniqErrors.length ? "WARN" : "PASS"}  [${slug}] console errors: ${uniqErrors.length}${uniqErrors.length ? "\n      " + uniqErrors.slice(0, 5).join("\n      ") : ""}`);
  await ctx.close();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const targets = only.length ? only : ["demo-shop", "demo-cafe"];
  for (const t of targets) {
    const cfg = CFG[t];
    if (!cfg) {
      console.log(`unknown tenant ${t}`);
      continue;
    }
    console.log(`\n===== ${t} =====`);
    await runTenant(browser, cfg).catch((e) => console.log(`ABORT [${t}] ${e instanceof Error ? e.message : e}`));
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
  for (const f of failed) console.log(`  FAIL [${f.tenant}] ${f.step} — ${f.note}`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
