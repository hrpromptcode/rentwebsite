import "../../load-env";
import { getDb, withTenant } from "@rentweb/db";
import { getServiceBySlug, listServices, listStaffForService } from "../../../packages/modules/booking/src/services/index";
async function main() {
  const tid = "01a1401b-c042-734c-91a5-94f4d80448cb";
  const r = await withTenant(getDb(), tid, async (tx) => {
    const s = await getServiceBySlug(tx, tid, "pico");
    const team = s ? await listStaffForService(tx, tid, s.id) : null;
    const rel = s ? await listServices(tx, tid, { categorySlug: s.categorySlug ?? undefined, limit: 4 }) : null;
    return { s: s && { id: s.id, slug: s.slug, desc: s.description?.slice(0, 80) }, team: team?.length, rel: rel?.length };
  });
  console.log(JSON.stringify(r));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
