import { describe, expect, it } from "vitest";
import { slugify, tenantSlug, normalizeThaiPhone, formatDate } from "../src/utils";
import { formatMoney, thb, toSatang } from "../src/money";
import { resolveModules } from "../src/modules";
import { subdomainOf, isPlatformHost } from "../src/tenant/resolve";
import { encryptToString, decryptFromString } from "../src/crypto";

describe("utils", () => {
  it("slugify keeps thai letters and strips symbols", () => {
    expect(slugify("เสื้อ ลินิน / สีทราย!")).toBe("เสื้อ-ลินิน-สีทราย");
    expect(tenantSlug("My Shop ร้าน")).toBe("my-shop");
    expect(tenantSlug("ab").length).toBeGreaterThanOrEqual(3);
  });

  it("normalises thai phones", () => {
    expect(normalizeThaiPhone("+66 81 234 5678")).toBe("0812345678");
    expect(normalizeThaiPhone("081-234-5678")).toBe("0812345678");
    expect(normalizeThaiPhone("12345")).toBeNull();
  });

  it("money helpers", () => {
    expect(toSatang("1,290.50")).toBe(129050);
    expect(thb(129000)).toContain("1,290");
    expect(formatMoney(129050).endsWith("1,290.50")).toBe(true);
  });

  it("module dependency resolution always includes cms", () => {
    expect(resolveModules(["clinic"]).sort()).toEqual(["booking", "clinic", "cms"]);
    expect(resolveModules([])).toEqual(["cms"]);
  });

  it("host resolution", () => {
    process.env.PLATFORM_ROOT_DOMAIN = "localhost:3000";
    expect(subdomainOf("demo-shop.localhost:3000")).toBe("demo-shop");
    expect(subdomainOf("www.localhost")).toBeNull();
    expect(subdomainOf("a.b.localhost")).toBeNull();
    expect(isPlatformHost("app.localhost:3000")).toBe(true);
    expect(isPlatformHost("demo-shop.localhost")).toBe(false);
    expect(subdomainOf("myshop.com")).toBeNull();
  });

  it("crypto round trip", () => {
    const s = encryptToString("STEAM-1234-ABCD");
    expect(s.startsWith("v1.")).toBe(true);
    expect(decryptFromString(s)).toBe("STEAM-1234-ABCD");
  });

  it("formats dates in Thai", () => {
    expect(formatDate("2026-10-15T03:00:00Z", { withTime: true })).toMatch(/2569/);
  });
});
