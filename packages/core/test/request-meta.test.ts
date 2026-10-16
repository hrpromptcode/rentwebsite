import { describe, expect, it } from "vitest";
import { clientIp, isHttpsRequest, normalizeIp, trustedProxyHops } from "../src/customer";

/** auth follow-up (SEC-007 note): spoofable X-Forwarded-For and a host-name based cookie `secure` flag. */

const h = (o: Record<string, string>) => new Headers(o);

describe("trustedProxyHops (TRUSTED_PROXY)", () => {
  it("is 0 unless the setting names the proxies", () => {
    for (const v of [undefined, "", "0", "false", "no", "off", "none", "abc", "-1", "1.5", "99"]) expect(trustedProxyHops(v)).toBe(0);
    expect(trustedProxyHops("true")).toBe(1);
    expect(trustedProxyHops("1")).toBe(1);
    expect(trustedProxyHops(" 2 ")).toBe(2);
  });
});

describe("normalizeIp", () => {
  it("accepts IPv4 / IPv6 literals, strips ports, brackets and the IPv4-mapped prefix", () => {
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("203.0.113.7:51234")).toBe("203.0.113.7");
    expect(normalizeIp("[2001:DB8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("::ffff:198.51.100.2")).toBe("198.51.100.2");
    expect(normalizeIp("::1")).toBe("::1");
    expect(normalizeIp("2001:db8:0:0:0:0:0:1")).toBe("2001:db8:0:0:0:0:0:1");
  });
  it("rejects junk", () => {
    for (const v of ["", "unknown", "999.1.1.1", "1.2.3", "1:2", "1:::2", "<script>", "a".repeat(80), null, undefined]) expect(normalizeIp(v)).toBeNull();
  });
});

describe("clientIp", () => {
  const spoofed = h({ "x-forwarded-for": "6.6.6.6, 10.0.0.9", "x-real-ip": "198.51.100.20" });

  it("ignores X-Forwarded-For without TRUSTED_PROXY (client-controlled) and falls back to X-Real-IP", () => {
    expect(clientIp(spoofed, 0)).toBe("198.51.100.20");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6" }), 0)).toBeNull();
  });

  it("with TRUSTED_PROXY = n takes the entry n hops from the right, never the client-supplied left part", () => {
    expect(clientIp(spoofed, 1)).toBe("10.0.0.9");
    expect(clientIp(spoofed, 2)).toBe("6.6.6.6");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.5" }), 1)).toBe("203.0.113.5");
    expect(clientIp(h({ "x-forwarded-for": "evil, 203.0.113.5" }), 1)).toBe("203.0.113.5");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.5" }), 3)).toBe("203.0.113.5");
  });

  it("falls back to X-Real-IP when the trusted entry is not an IP", () => {
    expect(clientIp(h({ "x-forwarded-for": "garbage", "x-real-ip": "198.51.100.21" }), 1)).toBe("198.51.100.21");
  });

  it("reads TRUSTED_PROXY from the environment by default", () => {
    const prev = process.env.TRUSTED_PROXY;
    try {
      delete process.env.TRUSTED_PROXY;
      expect(clientIp(spoofed)).toBe("198.51.100.20");
      process.env.TRUSTED_PROXY = "1";
      expect(clientIp(spoofed)).toBe("10.0.0.9");
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY;
      else process.env.TRUSTED_PROXY = prev;
    }
  });
});

describe("isHttpsRequest (cookie secure flag)", () => {
  it("follows the protocol, not the host name", () => {
    expect(isHttpsRequest(h({ "x-forwarded-proto": "https", host: "demo-shop.localhost:3000" }))).toBe(true);
    expect(isHttpsRequest(h({ "x-forwarded-proto": "http", host: "shop.example.com" }))).toBe(false);
    expect(isHttpsRequest(h({ "x-forwarded-proto": "https, http" }))).toBe(true);
    expect(isHttpsRequest(h({}), "https://shop.example.com")).toBe(true);
    expect(isHttpsRequest(h({}), "http://shop.example.com")).toBe(false);
    expect(isHttpsRequest(h({}), "not a url")).toBe(false);
    expect(isHttpsRequest(h({}))).toBe(false);
  });
});
