/** correctness bughunt – drain the outbox once (dev: email/sms/line providers are unconfigured → "skipped"). */
import "../../load-env";
import { getAdminDb } from "@rentweb/db";
import { processOutbox } from "@rentweb/integrations/outbox";
import { done } from "./correctness-lib";
async function main() {
  const t0 = new Date();
  console.log("START", t0.toISOString());
  for (let i = 0; i < 20; i++) {
    const r = await processOutbox(getAdminDb(), 100);
    console.log("tick", i, JSON.stringify(r));
    if (!r.claimed) break;
  }
  await done();
}
main().catch(async (e) => { console.error("FATAL", e); await done(); process.exit(1); });
