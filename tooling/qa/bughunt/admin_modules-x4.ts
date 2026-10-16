import { ADMIN, chromium, collectErrors, loginState, shot } from "./admin_modules-lib";
import { and, desc, eq, getAdminDb, bookings, tenants } from "@rentweb/db";
const bkk = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const bkkTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
async function main() {
  const mode = process.argv[2] ?? "all";
  const db = getAdminDb();
  const browser = await chromium.launch();
  if (mode === "all" || mode === "slot") {
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, "demo-salon"));
    const rows = await db.select().from(bookings).where(and(eq(bookings.tenantId, t!.id), eq(bookings.source, "walk_in"))).orderBy(desc(bookings.createdAt)).limit(3);
    for (const b of rows) {
      const date = bkk(b.startsAt);
      const time = bkkTime(b.startsAt);
      const ctx = await browser.newContext(); const pg = await ctx.newPage(); await pg.goto("http://demo-salon.localhost:3000/robots.txt");
      const getj = (u: string) => pg.evaluate(async (u) => (await fetch(u)).json(), u);
      const j1: any = await getj(`/api/booking/slots?date=${date}&service=${b.serviceId}&staff=${b.staffId}`);
      const j2: any = await getj(`/api/booking/slots?date=${date}&service=${b.serviceId}&staff=`);
      const s1 = (j1.slots ?? []).find((s: any) => bkkTime(new Date(s.start)) === time);
      const s2 = (j2.slots ?? []).find((s: any) => bkkTime(new Date(s.start)) === time);
      console.log(b.number, b.status, date, time, "staff-slot:", JSON.stringify(s1 ?? "absent"), "| any-staff slot:", JSON.stringify(s2 ?? "absent"));
      await ctx.close();
    }
  }
  if (mode === "all" || mode === "resv") {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const errs: string[] = [];
    collectErrors(p, errs);
    const ymd = bkk(new Date(Date.now() + 3 * 86_400_000));
    await p.goto(`http://demo-restaurant.localhost:3000/reserve`, { waitUntil: "networkidle", timeout: 120_000 });
    await p.locator("#res-date").fill(ymd);
    const radios = p.getByRole("radiogroup", { name: "เวลา" }).getByRole("radio");
    const n = await radios.count();
    const labels = await radios.allInnerTexts();
    console.log("time options", n, labels.join(" "));
    const last = radios.nth(n - 1);
    const time = (await last.innerText()).trim();
    await last.click();
    await p.getByText("ว่าง สามารถจองได้").waitFor({ timeout: 15_000 });
    await p.locator("#res-name").fill("คุณ AM เวลา");
    await p.locator("#res-phone").fill("0861234599");
    await p.getByRole("button", { name: /ยืนยันการจอง/ }).click();
    await p.waitForURL(/\/reservations\/RS-\d+\?p=/, { timeout: 30_000 });
    const number = p.url().match(/RS-\d+/)![0];
    console.log("storefront reservation", number, ymd, time, "page:", (await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200));
    const r = await db.execute((await import("@rentweb/db")).sql`select starts_at, ends_at, status from reservations where number=${number} order by created_at desc limit 1`);
    const row: any = ((r as any).rows ?? r)[0];
    console.log("db starts_at", new Date(row.starts_at).toISOString(), "bkk", bkk(new Date(row.starts_at)), bkkTime(new Date(row.starts_at)), row.status);
    const st = await loginState(browser);
    const actx = await browser.newContext({ storageState: st, viewport: { width: 1440, height: 900 } });
    const a = await actx.newPage();
    collectErrors(a, errs);
    await a.goto(`${ADMIN}/t/demo-restaurant/restaurant/reservations?date=${ymd}`, { waitUntil: "networkidle", timeout: 120_000 });
    const main = (await a.locator("main").innerText()).replace(/\s+/g, " ");
    const idx = main.indexOf(number);
    console.log("admin day page has", number, idx >= 0, "context:", idx >= 0 ? main.slice(Math.max(0, idx - 120), idx + 120) : main.slice(0, 300));
    await a.screenshot({ path: shot("resv-admin-day"), fullPage: true });
    console.log("errors", [...new Set(errs)].slice(0, 8));
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e.message.slice(0, 300)); process.exit(1); });
