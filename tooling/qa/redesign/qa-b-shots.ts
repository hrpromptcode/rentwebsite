import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { isolateHmr, stableGoto } from "../bughunt/fixes/_dev-stable";

/**
 * qa-b visual QA crawl — demo-clinic / salon / course / restaurant, every page.
 *   pnpm exec tsx qa/redesign/qa-b-shots.ts [--sites=clinic,salon] [--only=home,services] [--w=1440,390]
 *        [--mode=normal|reduce|nogl] [--tag=before] [--login] [--nosheet] [--fps]
 * → tooling/screenshots/redesign-qa-b-<tag>-<site>-<name>[-reduce|-nogl]-<w>[-pN].png
 *   (contact sheets of viewport frames every 0.85 vh: what a visitor actually sees while scrolling)
 * Prints per page: HTTP status, horizontal overflow, scene statuses + max live canvases in one viewport, console / hydration
 * errors, small tap targets (< 44 px), broken / low-res images, low-contrast text samples, clipped headings.
 */
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, ...v]) => [k, v.join("=") || "1"]));
const SITES = (args.sites ?? "clinic,salon,course,restaurant").split(",");
const ONLY = args.only ? args.only.split(",") : null;
const WIDTHS = (args.w ?? "1440,390").split(",").map(Number);
const MODE = (args.mode ?? "normal") as "normal" | "reduce" | "nogl";
const TAG = args.tag ?? "run";
const LOGIN = !!args.login;
const SHEET = !args.nosheet;
const FPS = !!args.fps;
const SHOTS = path.resolve(process.cwd(), "screenshots");

/** real ids/slugs from the DB (they change at every reset-demo) */
async function loadIds() {
  await import("../../load-env");
  const { getAdminDb, tenants, bookings, clinicPackages, diningTables, restaurantOrders, reservations, eq, desc, and, isNotNull } = await import("@rentweb/db");
  const db = getAdminDb();
  const out: Record<string, { booking?: string; bookingCancelled?: string; pkg?: string; table?: string; order?: string; reservation?: string }> = {};
  for (const site of ["clinic", "salon", "course", "restaurant"]) {
    const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, `demo-${site}`));
    if (!t) continue;
    const o: (typeof out)[string] = {};
    if (site === "restaurant") {
      const [tb] = await db.select({ q: diningTables.qrToken }).from(diningTables).where(eq(diningTables.tenantId, t.id)).limit(1);
      const [or] = await db.select({ n: restaurantOrders.number, p: restaurantOrders.customerPhone }).from(restaurantOrders).where(and(eq(restaurantOrders.tenantId, t.id), eq(restaurantOrders.type, "pickup"))).orderBy(desc(restaurantOrders.createdAt)).limit(1);
      const [rs] = await db.select({ n: reservations.number, p: reservations.phone }).from(reservations).where(eq(reservations.tenantId, t.id)).orderBy(desc(reservations.createdAt)).limit(1);
      if (tb) o.table = `/t/${tb.q}`;
      if (or) o.order = `/orders/r/${or.n}?p=${or.p}`;
      if (rs) o.reservation = `/reservations/${rs.n}?p=${rs.p}`;
    } else {
      const bs = await db.select({ id: bookings.id, s: bookings.status, a: bookings.answers }).from(bookings).where(and(eq(bookings.tenantId, t.id), isNotNull(bookings.answers))).orderBy(desc(bookings.createdAt)).limit(30);
      const key = (b: (typeof bs)[number]) => (b.a as { accessKey?: string } | null)?.accessKey;
      const live = bs.find((b) => key(b) && b.s !== "cancelled");
      const dead = bs.find((b) => key(b) && b.s === "cancelled");
      if (live) o.booking = `/bookings/${live.id}?k=${key(live)}`;
      if (dead) o.bookingCancelled = `/bookings/${dead.id}?k=${key(dead)}`;
      const [pk] = await db.select({ id: clinicPackages.id }).from(clinicPackages).where(eq(clinicPackages.tenantId, t.id)).limit(1);
      if (pk) o.pkg = `/packages/${pk.id}/buy`;
    }
    out[site] = o;
  }
  return out;
}

function routesFor(ids: Awaited<ReturnType<typeof loadIds>>): Record<string, Array<[string, string]>> {
  const opt = (name: string, v: string | undefined): Array<[string, string]> => (v ? [[name, v]] : []);
  const c = ids.clinic ?? {};
  const s = ids.salon ?? {};
  const k = ids.course ?? {};
  const r = ids.restaurant ?? {};
  return {
    clinic: [
      ["home", "/"], ["services", "/services"], ["services-laser", "/services?category=laser"], ["service-botox", "/services/botox"], ["service-consult", "/services/consult"],
      ["staff", "/staff"], ["staff-nicha", "/staff/dr-nicha"], ["packages", "/packages"], ...opt("buy", c.pkg),
      ["book", "/book"], ["book-date", "/book?service=botox&staff=dr-nicha"], ...opt("booking", c.booking), ...opt("booking-cancelled", c.bookingCancelled),
      ["booking-locked", "/bookings/01a1609e-21a8-74df-9a90-e53530aa60a6"], ["gallery", "/gallery"], ["about", "/about"], ["contact", "/contact"],
      ["privacy", "/privacy"], ["terms", "/terms"], ["refund", "/refund"], ["account", "/account"], ["acc-bookings", "/account/bookings"], ["acc-packages", "/account/packages"],
      ["notfound", "/services/does-not-exist"],
    ],
    salon: [
      ["home", "/"], ["services", "/services"], ["services-skin", "/services?category=skin"], ["service-aroma", "/services/aroma-90"], ["service-couple", "/services/couple"],
      ["staff", "/staff"], ["staff-mali", "/staff/mali"], ["book", "/book"], ["book-couple", "/book?service=couple"], ...opt("booking", s.booking), ...opt("booking-cancelled", s.bookingCancelled),
      ["gallery", "/gallery"], ["about", "/about"], ["contact", "/contact"], ["privacy", "/privacy"], ["terms", "/terms"], ["refund", "/refund"],
      ["packages", "/packages"], ["account", "/account"], ["acc-bookings", "/account/bookings"],
    ],
    course: [
      ["home", "/"], ["classes", "/classes"], ["classes-beginner", "/classes?level=beginner"], ["classes-pilates", "/classes?category=pilates"], ["class-hatha", "/classes/hatha-basic"],
      ["class-reformer", "/classes/reformer-flow"], ["schedule", "/schedule"], ["schedule-nan", "/schedule?instructor=kru-nan"], ["instructors", "/instructors"],
      ["instructor-nan", "/instructors/kru-nan"], ["packages", "/packages"], ...opt("buy", k.pkg), ["start", "/start"],
      ["book", "/book?service=hatha-basic"], ...opt("booking", k.booking), ...opt("booking-cancelled", k.bookingCancelled), ["gallery", "/gallery"], ["about", "/about"], ["contact", "/contact"],
      ["privacy", "/privacy"], ["terms", "/terms"], ["refund", "/refund"], ["account", "/account"], ["acc-bookings", "/account/bookings"], ["acc-packages", "/account/packages"],
    ],
    restaurant: [
      ["home", "/"], ["menu", "/menu"], ["order", "/order"], ["reserve", "/reserve"], ...opt("reservation", r.reservation),
      ["reservation-locked", r.reservation ? r.reservation.split("?")[0]! : "/reservations/RS-0000"], ["lookup", "/orders/r/lookup"],
      ...opt("order-status", r.order), ["order-locked", r.order ? r.order.split("?")[0]! : "/orders/r/R-0000"], ...opt("table", r.table),
      ["about", "/about"], ["contact", "/contact"], ["privacy", "/privacy"], ["terms", "/terms"], ["refund", "/refund"], ["account", "/account"],
    ],
  };
}

async function settle(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
}

async function signIn(ctx: BrowserContext, site: string) {
  const p = await ctx.newPage();
  try {
    await stableGoto(p, `http://demo-${site}.localhost:3000/account/login?next=%2Faccount`, "load");
    await p.fill("#otp-target", "0899001122");
    await p.locator('form button[type="submit"]').click();
    await p.locator("#otp-code").waitFor({ timeout: 60_000 });
    const code = (await p.evaluate(() => document.body.innerText)).match(/รหัสของคุณคือ\s*(\d{6})/)?.[1];
    if (!code) throw new Error("no dev OTP");
    await p.fill("#otp-code", code);
    if (await p.locator("#otp-name").isVisible().catch(() => false)) await p.fill("#otp-name", "คุณทดสอบ ดีไซน์");
    await p.locator('form button[type="submit"]').click();
    await p.waitForURL((u) => !u.pathname.startsWith("/account/login"), { timeout: 60_000 });
    console.log(`signed in ${site}`);
  } catch (e) {
    console.log(`LOGIN FAIL ${site}: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await p.close();
  }
}

/** in-page audit (runs at the current scroll position over the whole document) */
function audit() {
  const vw = window.innerWidth;
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  // small tap targets (ignore inline links inside running text)
  const small: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=radio],summary")) {
    if (!vis(el) || el.closest("[aria-hidden=true],[inert]")) continue;
    if (el.tagName === "INPUT" && ["radio", "checkbox"].includes((el as HTMLInputElement).type)) {
      const lab = el.closest("label");
      if (lab && lab.getBoundingClientRect().height >= 40) continue;
      if (getComputedStyle(el).opacity === "0" || el.classList.contains("sr-only")) continue;
    }
    const r = el.getBoundingClientRect();
    const inline = el.tagName === "A" && !!el.closest("p,li>p,.prose,figcaption") && getComputedStyle(el).display === "inline";
    if (inline) continue;
    if (r.height < 40 || r.width < 40) {
      const t = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 28);
      small.push(`${el.tagName.toLowerCase()}"${t}"${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  // images
  const badImg: string[] = [];
  for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
    if (!vis(img)) continue;
    const r = img.getBoundingClientRect();
    const src = (img.currentSrc || img.src).replace(/^.*?(photo-[\w-]+|[^/]{0,40})(\?.*)?$/, "$1");
    if (img.complete && img.naturalWidth === 0) badImg.push(`BROKEN ${src || img.outerHTML.slice(0, 90)}`);
    else if (img.complete && img.naturalWidth && img.naturalWidth < r.width * 0.75 * 1 && r.width > 160) badImg.push(`LOWRES ${src} ${img.naturalWidth}<${Math.round(r.width)}`);
  }
  // contrast (approx: solid ancestor background only)
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0]!, g: p[1]!, b: p[2]!, a: p[3] ?? 1 };
  };
  const lum = (c: { r: number; g: number; b: number }) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const lowC: string[] = [];
  const seen = new Set<string>();
  for (const el of document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,li,a,button,span,label,dd,dt,td,th,small")) {
    if (lowC.length > 8) break;
    if (!vis(el)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 1);
    if (!own) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.5) continue;
    let bg: { r: number; g: number; b: number; a: number } | null = null;
    let skip = false;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== "none" || n.tagName === "VIDEO" || n.querySelector(":scope > img,:scope > canvas,:scope > picture")) {
        if (n !== el || s.backgroundImage !== "none") {
          skip = true;
          break;
        }
      }
      const b = parse(s.backgroundColor);
      if (b && b.a > 0.85) {
        bg = b;
        break;
      }
      if (b && b.a > 0.1) {
        skip = true;
        break;
      }
    }
    if (skip || !bg) continue;
    const L1 = lum(fg);
    const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 600;
    const need = size >= 24 || (size >= 18.6 && bold) ? 3 : 4.5;
    if (ratio < need) {
      const t = el.textContent!.trim().replace(/\s+/g, " ").slice(0, 24);
      const k = `${t}|${ratio.toFixed(1)}`;
      if (!seen.has(k)) {
        seen.add(k);
        lowC.push(`"${t}" ${ratio.toFixed(2)}<${need}`);
      }
    }
  }
  // clipped headings (text wider/taller than its box with overflow hidden) + overflowing elements
  const clip: string[] = [];
  for (const h of document.querySelectorAll<HTMLElement>("h1,h2,h3")) {
    if (!vis(h)) continue;
    const cs = getComputedStyle(h);
    if ((cs.overflow.includes("hidden") || cs.overflowY === "hidden") && h.scrollHeight > h.clientHeight + 2) clip.push(`${h.tagName}"${h.textContent!.trim().slice(0, 20)}" ${h.scrollHeight}>${h.clientHeight}`);
    const r = h.getBoundingClientRect();
    if (r.right > vw + 1) clip.push(`${h.tagName}"${h.textContent!.trim().slice(0, 20)}" right=${Math.round(r.right)}`);
  }
  const wide: string[] = [];
  if (document.documentElement.scrollWidth > vw) {
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 0 && wide.length < 4) {
        const anc = el.closest("[style*=overflow],.overflow-hidden,.overflow-x-auto");
        if (!anc) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} r=${Math.round(r.right)}`);
      }
    }
  }
  return {
    ov: document.documentElement.scrollWidth - vw,
    scenes: [...document.querySelectorAll<HTMLElement>("[data-scene-status]")].map((e) => e.dataset.sceneStatus).join(","),
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent!.trim().replace(/\s+/g, " ").slice(0, 40)).join(" | "),
    small: [...new Set(small)].slice(0, 8),
    smallN: small.length,
    badImg: badImg.slice(0, 6),
    lowC,
    clip: clip.slice(0, 5),
    wide,
    h: document.documentElement.scrollHeight,
  };
}

async function liveInView(page: Page) {
  return page.evaluate(() => {
    let n = 0;
    for (const c of document.querySelectorAll("canvas")) {
      const r = c.getBoundingClientRect();
      if (r.width > 20 && r.height > 20 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(c).visibility !== "hidden") n++;
    }
    return n;
  });
}

async function fps(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.mouse.move(700, 450);
  const p = page.evaluate(
    () =>
      new Promise<{ fps: number; long: number; worst: number }>((res) => {
        let n = 0;
        let long = 0;
        let worst = 0;
        let last = performance.now();
        const t0 = last;
        const tick = (t: number) => {
          const d = t - last;
          last = t;
          n++;
          if (d > 50) long++;
          worst = Math.max(worst, d);
          if (t - t0 < 4000) requestAnimationFrame(tick);
          else res({ fps: Math.round((n * 1000) / (t - t0)), long, worst: Math.round(worst) });
        };
        requestAnimationFrame(tick);
      }),
  );
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 140);
    await page.waitForTimeout(55);
  }
  return p;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const ROUTES = routesFor(await loadIds());
  const gpu = ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"];
  const browser = await chromium.launch({ args: MODE === "nogl" ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : gpu });
  const sfx = MODE === "normal" ? "" : `-${MODE}`;
  for (const w of WIDTHS) {
    for (const site of SITES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: w < 768 ? 844 : 900 }, deviceScaleFactor: 1, locale: "th-TH", timezoneId: "Asia/Bangkok", reducedMotion: MODE === "reduce" ? "reduce" : "no-preference", isMobile: w < 768, hasTouch: w < 768 });
      await isolateHmr(ctx);
      await ctx.addInitScript("window.__name = (f) => f");
      if (LOGIN) await signIn(ctx, site);
      for (const [name, route] of ROUTES[site] ?? []) {
        if (ONLY && !ONLY.includes(name)) continue;
        const page = await ctx.newPage();
        const errs: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error" || /hydrat|did not match/i.test(m.text())) errs.push(m.text().replace(/\s+/g, " ").slice(0, 220));
        });
        page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 200)}`));
        try {
          const res = await stableGoto(page, `http://demo-${site}.localhost:3000${route}`, "load");
          await page.waitForTimeout(1500);
          await settle(page);
          let fp = "";
          const info = await page.evaluate(audit);
          let maxLive = 0;
          if (SHEET) {
            const vh = page.viewportSize()!.height;
            const total = await page.evaluate(() => document.documentElement.scrollHeight);
            const shots: string[] = [];
            await page.waitForTimeout(MODE === "reduce" ? 300 : 1500);
            for (let y = 0; y < total - 60 && shots.length < 30; y += Math.round(vh * 0.85)) {
              await page.evaluate((yy) => window.scrollTo(0, yy), y);
              await page.waitForTimeout(MODE === "reduce" ? 350 : 1000);
              maxLive = Math.max(maxLive, await liveInView(page));
              shots.push((await page.screenshot({ type: "jpeg", quality: 72, timeout: 120_000 })).toString("base64"));
            }
            const per = w < 768 ? 8 : 6;
            const cols = w < 768 ? 4 : 2;
            for (let i = 0; i < shots.length; i += per) {
              const chunk = shots.slice(i, i + per);
              const sheet = await ctx.newPage();
              await sheet.setViewportSize({ width: 1800, height: 900 });
              await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">${chunk.map((b, j) => `<figure style="margin:0;color:#aaa;font:12px monospace"><img style="width:100%;display:block" src="data:image/jpeg;base64,${b}">f${String(i + j).padStart(2, "0")}</figure>`).join("")}</body>`, { waitUntil: "load" });
              const suffix = shots.length > per ? `-p${i / per + 1}` : "";
              await sheet.screenshot({ path: path.join(SHOTS, `redesign-qa-b-${TAG}-${site}-${name}${sfx}-${w}${suffix}.png`), fullPage: true, timeout: 120_000 });
              await sheet.close();
            }
          }
          if (FPS && name === "home") {
            const f = await fps(page);
            fp = ` fps=${f.fps} long=${f.long} worst=${f.worst}ms`;
          }
          const lines = [
            `${res?.status()} ${site} ${name} ${w}${sfx}: h1=[${info.h1}] ov=${info.ov}px scenes=[${info.scenes}] live/vp=${maxLive} errs=${errs.length} small=${info.smallN}${fp}`,
          ];
          if (errs.length) lines.push(`   ERR ${[...new Set(errs)].slice(0, 4).join("\n   ERR ")}`);
          if (info.small.length) lines.push(`   TAP ${info.small.join(" ; ")}`);
          if (info.badImg.length) lines.push(`   IMG ${info.badImg.join(" ; ")}`);
          if (info.lowC.length) lines.push(`   CON ${info.lowC.join(" ; ")}`);
          if (info.clip.length) lines.push(`   CLIP ${info.clip.join(" ; ")}`);
          if (info.wide.length) lines.push(`   WIDE ${info.wide.join(" ; ")}`);
          console.log(lines.join("\n"));
        } catch (e) {
          console.log(`FAIL ${site} ${name} ${w}: ${(e as Error).message.split("\n")[0]}`);
        } finally {
          await page.close();
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
