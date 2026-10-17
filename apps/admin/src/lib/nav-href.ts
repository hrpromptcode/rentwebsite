/**
 * Navigation link validation (ADMIN_B2-18). Pure, no Next imports.
 * Allowed: same-site paths ("/about", "/products?sort=new", "#contact"), absolute http(s) URLs and the
 * app/contact schemes mailto:, tel:, sms:, line:. Everything else (javascript:, data:, vbscript:, file:,
 * protocol-relative "//host", backslashes, control characters, bare words) is refused.
 */
const APP_SCHEMES = new Set(["mailto:", "tel:", "sms:", "line:"]);

export type NavHrefCheck = { ok: true; href: string; absolute: boolean } | { ok: false; error: string };

export const NAV_HREF_HINT = "ใช้ลิงก์ที่ขึ้นต้นด้วย / (หน้าในเว็บ), # (ส่วนในหน้า), https://, mailto:, tel: หรือ line:";

export function checkNavHref(input: string): NavHrefCheck {
  const href = input.trim();
  if (!href) return { ok: false, error: "กรุณาใส่ลิงก์" };
  if (href.length > 500) return { ok: false, error: "ลิงก์ยาวเกิน 500 ตัวอักษร" };
  // control characters / whitespace inside a URL are how "java\tscript:" style tricks get past naive checks
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(href)) return { ok: false, error: `ลิงก์ “${href.slice(0, 40)}” มีอักขระที่ใช้ไม่ได้ (ช่องว่างหรือเครื่องหมาย \\)` };
  if (href.startsWith("#")) return { ok: true, href, absolute: false };
  if (href.startsWith("/")) {
    if (href.startsWith("//")) return { ok: false, error: `ลิงก์ “${href.slice(0, 40)}” ไม่ถูกต้อง — ${NAV_HREF_HINT}` };
    return { ok: true, href, absolute: false };
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (!scheme) return { ok: false, error: `ลิงก์ “${href.slice(0, 40)}” ไม่ถูกต้อง — ${NAV_HREF_HINT}` };
  if (scheme === "http" || scheme === "https") {
    try {
      const u = new URL(href);
      if (!u.hostname) throw new Error("no host");
    } catch {
      return { ok: false, error: `ลิงก์ “${href.slice(0, 40)}” ไม่ใช่ URL ที่ถูกต้อง` };
    }
    return { ok: true, href, absolute: true };
  }
  if (APP_SCHEMES.has(`${scheme}:`)) {
    if (href.length <= scheme.length + 1) return { ok: false, error: `ลิงก์ “${href}” ไม่สมบูรณ์` };
    return { ok: true, href, absolute: true };
  }
  return { ok: false, error: `ไม่อนุญาตลิงก์แบบ “${scheme}:” — ${NAV_HREF_HINT}` };
}
