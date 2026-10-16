import { readFileSync } from "node:fs";
import { go, launch, newCtx, newPage, out, readCreds } from "./admin_b2-lib";
const C = readCreds();
const T = Object.fromEntries(C.tenants.map((t: any) => [t.key, t.slug]));
const CHECK: Array<[string, string, RegExp]> = [
  [T.restaurant, "/restaurant/tables", /เพิ่มโต๊ะ|เพิ่มโซน|แก้ไข|ลบ/],
  [T.restaurant, "/restaurant/menu", /เพิ่มเมนู|เพิ่มหมวด|แก้ไข|ลบ/],
  [T.restaurant, "/restaurant/orders", /ยกเลิก|เริ่มทำ|รับชำระ|ปิดบิล|ยืนยันการชำระ/],
  [T.restaurant, "/restaurant/reservations", /เพิ่มการจอง|อนุมัติมัดจำ/],
  [T.salon, "/services", /เพิ่มบริการ|ปิดการใช้งาน|แก้ไข/],
  [T.salon, "/staff", /เพิ่มพนักงาน|เปิดใช้งาน/],
  [T.salon, "/bookings", /จองให้ลูกค้า/],
  [T.clinic, "/clinic/packages", /เพิ่มคอร์ส|ปิดการขาย|แก้ไข/],
  [T.clinic, "/clinic/patients", /เพิ่มผู้ป่วย/],
  [T.shop, "/products", /เพิ่มสินค้า|ตั้งเป็นสินค้าแนะนำ/],
  [T.shop, "/orders", /สร้างออเดอร์|ออเดอร์ใหม่/],
  [T.shop, "/discounts", /สร้างคูปอง|เพิ่มคูปอง/],
  [T.shop, "/payments", /อนุมัติ|ยืนยัน|ปฏิเสธ/],
];
async function main() {
  const browser = await launch();
  for (const role of ["staff", "manager"]) {
    const ctx = await newCtx(browser, { storageState: JSON.parse(readFileSync(`qa/bughunt/admin_b2-state-${role}.json`, "utf8")) });
    const page = await newPage(ctx);
    const rows: string[] = [];
    for (const [slug, p, re] of CHECK) {
      const s = await go(page, `/t/${slug}${p}`);
      const btns = await page.locator("main button, main a").evaluateAll((els, src) => els.filter((e) => new RegExp(src).test((e as HTMLElement).innerText || e.getAttribute("aria-label") || "") && (e as HTMLElement).offsetParent !== null).map((e) => `${((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").trim().slice(0, 18)}${(e as HTMLButtonElement).disabled ? "[dis]" : ""}`), re.source);
      rows.push(`${p} ${s}: ${[...new Set(btns)].slice(0, 6).join(", ") || "-"}`);
    }
    out(role, rows);
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
