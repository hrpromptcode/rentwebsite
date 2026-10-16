import { eq, tenantDomains } from "@rentweb/db";
import { done, out, plat, readCreds } from "./admin_b2-lib";
async function main() {
  const C = readCreds();
  for (const t of C.tenants) {
    const rows = await plat((tx) => tx.select({ h: tenantDomains.hostname, s: tenantDomains.status, k: tenantDomains.kind }).from(tenantDomains).where(eq(tenantDomains.tenantId, t.id)));
    out(t.key, rows);
  }
  await done();
}
main();
