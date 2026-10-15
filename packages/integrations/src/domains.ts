import { promises as dns } from "node:dns";
import { eq } from "drizzle-orm";
import { tenantDomains, type Tx } from "@rentweb/db";
import { invalidateHost } from "@rentweb/core/tenant";
import { rootDomain } from "@rentweb/core/env";

/** Expected DNS: CNAME <host> → cname.<root>  and  TXT _rentweb-verify.<host> → rw-verify=<token> */
export function dnsInstructions(hostname: string, token: string) {
  const root = rootDomain();
  return {
    cname: { name: hostname, value: `cname.${root}` },
    txt: { name: `_rentweb-verify.${hostname}`, value: `rw-verify=${token}` },
  };
}

export async function checkDomainDns(hostname: string, token: string): Promise<{ cnameOk: boolean; txtOk: boolean; detail: string }> {
  const root = rootDomain();
  let cnameOk = false;
  let txtOk = false;
  const notes: string[] = [];
  try {
    const cnames = await dns.resolveCname(hostname);
    cnameOk = cnames.some((c) => c.replace(/\.$/, "").toLowerCase() === `cname.${root}`);
    if (!cnameOk) notes.push(`CNAME → ${cnames.join(", ")}`);
  } catch (e) {
    // apex domains use A records (CNAME flattening) – accept when they resolve to our edge
    try {
      const a = await dns.resolve4(hostname);
      const edge = (process.env.EDGE_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      cnameOk = edge.length > 0 && a.some((ip) => edge.includes(ip));
      if (!cnameOk) notes.push(`A → ${a.join(", ")}`);
    } catch {
      notes.push(`no CNAME/A (${(e as Error).message})`);
    }
  }
  try {
    const txts = (await dns.resolveTxt(`_rentweb-verify.${hostname}`)).map((parts) => parts.join(""));
    txtOk = txts.includes(`rw-verify=${token}`);
    if (!txtOk) notes.push(`TXT → ${txts.join(" | ") || "none"}`);
  } catch (e) {
    notes.push(`no TXT (${(e as Error).message})`);
  }
  return { cnameOk, txtOk, detail: notes.join("; ") };
}

/** Re-checks a pending custom domain; returns true when it became active. */
export async function verifyTenantDomain(tx: Tx, domainId: string): Promise<boolean> {
  const [d] = await tx.select().from(tenantDomains).where(eq(tenantDomains.id, domainId)).limit(1);
  if (!d || d.kind !== "custom" || d.status === "active") return !!d && d.status === "active";
  const token = d.verificationToken ?? "";
  const r = await checkDomainDns(d.hostname, token);
  const ok = r.cnameOk && r.txtOk;
  await tx
    .update(tenantDomains)
    .set({ status: ok ? "active" : "verifying", verifiedAt: ok ? new Date() : null, lastCheckedAt: new Date(), lastError: ok ? null : r.detail, sslStatus: ok ? "provisioning" : d.sslStatus })
    .where(eq(tenantDomains.id, domainId));
  if (ok) await invalidateHost(d.hostname);
  return ok;
}
