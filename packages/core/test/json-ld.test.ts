import { describe, expect, it } from "vitest";
import { safeJsonForScript, serializeJsonLd } from "../src/utils";

const BS = String.fromCharCode(92);

describe("safeJsonForScript / serializeJsonLd (ADMIN_B2-20)", () => {
  const payload = "กางเกงขากว้าง</script><script>window.__b2=document.domain</script>";
  const ld = { "@context": "https://schema.org", "@type": "Product", name: payload, sku: "A&B>C", description: "line\u2028sep\u2029para", brand: { name: "<!-- shop" } };

  it("cannot close the script tag or open a comment / CDATA", () => {
    const out = serializeJsonLd(ld);
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(out).toContain(`${BS}u003c/script${BS}u003e`);
  });

  it("round-trips to the same data", () => {
    expect(JSON.parse(serializeJsonLd(ld))).toEqual(ld);
    // eslint-disable-next-line no-new-func
    expect(new Function(`return ${safeJsonForScript(ld)}`)()).toEqual(ld);
  });

  it("handles undefined", () => {
    expect(safeJsonForScript(undefined)).toBe("null");
  });
});
