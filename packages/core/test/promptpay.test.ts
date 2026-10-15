import { describe, expect, it } from "vitest";
import { crc16, normalizePromptpayId, promptpayPayload } from "../src/payments/promptpay";

describe("promptpay payload", () => {
  it("crc16-ccitt check value", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("normalises phone numbers to the 0066 format", () => {
    expect(normalizePromptpayId("081-234-5678")).toEqual({ tag: "01", value: "0066812345678" });
    expect(normalizePromptpayId("1234567890123")).toEqual({ tag: "02", value: "1234567890123" });
  });

  it("builds a dynamic payload with amount and valid crc", () => {
    const p = promptpayPayload("0812345678", 129000);
    expect(p.startsWith("000201010212")).toBe(true);
    expect(p).toContain("0016A000000677010111");
    expect(p).toContain("5303764");
    expect(p).toContain("54071290.00");
    expect(p).toContain("5802TH");
    const body = p.slice(0, -4);
    expect(p.slice(-4)).toBe(crc16(body));
  });

  it("builds a static payload without amount", () => {
    const p = promptpayPayload("0812345678");
    expect(p.startsWith("000201010211")).toBe(true);
    expect(p).not.toContain("5407");
  });
});
