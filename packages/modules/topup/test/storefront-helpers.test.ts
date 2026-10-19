import { describe, expect, it } from "vitest";
import { MAX_WALLET_TOPUP_SATANG, parseBahtInput } from "../src/components/format";
import { ERROR_LABEL, parseTopupOrderNumber, rateLimitedLabel } from "../src/labels";

// Pure storefront helpers (fix packet tooling/qa/bughunt/fixes/topup_storefront.md).

describe("parseTopupOrderNumber (STOREFRONT-03)", () => {
  it("normalises valid numbers", () => {
    expect(parseTopupOrderNumber("TP-1040")).toBe("TP-1040");
    expect(parseTopupOrderNumber("  tp-1040 ")).toBe("TP-1040");
  });
  it("rejects control characters, garbage and non-strings without throwing", () => {
    for (const bad of ["TP-1040\u0000", "\u0000", "", "TP-", "TP-12a", "1040", "TP-1040'; drop table x;--", "TP-12345678901", "ORD-1001"]) expect(parseTopupOrderNumber(bad)).toBeNull();
    expect(parseTopupOrderNumber(undefined)).toBeNull();
    expect(parseTopupOrderNumber(["TP-1040"])).toBeNull();
  });
});

describe("parseBahtInput (STOREFRONT-14)", () => {
  const ok = (raw: string) => {
    const r = parseBahtInput(raw);
    return r.ok ? r.satang : `ERR ${r.error}`;
  };
  it("parses plain, decimal, separated and Thai-digit amounts to satang without float drift", () => {
    expect(ok("20")).toBe(2000);
    expect(ok("20.5")).toBe(2050);
    expect(ok("20.55")).toBe(2055);
    expect(ok("0.29")).toBe(29);
    expect(ok(".5")).toBe(50);
    expect(ok("20.")).toBe(2000);
    expect(ok("1,500")).toBe(150000);
    expect(ok("฿ 1 000")).toBe(100000);
    expect(ok("๑๐๐")).toBe(10000);
    expect(ok("๑,๐๐๐.๕๐")).toBe(100050);
  });
  it("rejects exponents, signs, letters, several dots and >2 decimals with Thai copy", () => {
    for (const bad of ["1e3", "-5", "+5", "abc", "1.2.3", "20.555", "100.005", "0x10", "Infinity", "NaN"]) {
      const r = parseBahtInput(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/[ก-๙]/);
    }
    expect(parseBahtInput("").ok).toBe(false);
    expect(parseBahtInput("0").ok).toBe(false);
  });
  it("enforces the per-top-up cap", () => {
    expect(ok("100000")).toBe(MAX_WALLET_TOPUP_SATANG);
    const r = parseBahtInput("100000.01");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("สูงสุด");
    expect(parseBahtInput("50", { max: 4000 }).ok).toBe(false);
  });
});

describe("rateLimitedLabel (STOREFRONT-17)", () => {
  it("states the real rule: hourly cap, rolling 60 minutes, unpaid orders count", () => {
    const s = rateLimitedLabel(10);
    expect(s).toContain("10 รายการต่อชั่วโมง");
    expect(s).toContain("60 นาที");
    expect(s).toContain("ยังไม่ชำระ");
    expect(s).not.toContain("สักครู่");
    expect(ERROR_LABEL.rate_limited).not.toContain("สักครู่");
    expect(rateLimitedLabel(0)).toBe(ERROR_LABEL.rate_limited);
  });
});
