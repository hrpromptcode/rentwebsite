import "server-only";
import { cookies } from "next/headers";
import type { PaymentAccessProof } from "@rentweb/core/payments";
import { TABLE_COOKIE } from "@rentweb/module-restaurant/services";
import { getCurrentCustomer } from "@/lib/customer";

const str = (v: FormDataEntryValue | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The page that issued a same-origin request (PaymentPanel fetches from /orders/<id>?k=…, /reservations/<n>?p=…). */
function sameOriginReferer(req: Request): URL | null {
  const ref = req.headers.get("referer");
  if (!ref) return null;
  try {
    const u = new URL(ref);
    const hosts = [req.headers.get("host"), req.headers.get("x-forwarded-host")].filter((h): h is string => !!h).map((h) => h.toLowerCase());
    return hosts.includes(u.host.toLowerCase()) ? u : null;
  } catch {
    return null;
  }
}

/**
 * Collects the payer's proof for /api/payments/<id>[/slip]: customer session cookie, table session cookie,
 * and the access key (?k=) / phone (?p=) of the page the payment belongs to — taken from the form fields
 * `k` / `p`, the request query, an `x-access-key` header, or the same-origin Referer (current PaymentPanel).
 * The values are only compared (timing-safe) by canAccessPayment(); nothing here grants access by itself.
 */
export async function paymentProof(req: Request, tenantId: string, form?: FormData | null): Promise<PaymentAccessProof> {
  const url = new URL(req.url);
  const referer = sameOriginReferer(req);
  const pick = (name: string) => str(form?.get(name)) ?? str(url.searchParams.get(name)) ?? str(referer?.searchParams.get(name));
  const [customer, jar] = await Promise.all([getCurrentCustomer(tenantId), cookies()]);
  return {
    customerId: customer?.id ?? null,
    accessKey: str(req.headers.get("x-access-key")) ?? pick("k"),
    phone: pick("p"),
    tableToken: jar.get(TABLE_COOKIE)?.value ?? null,
  };
}
