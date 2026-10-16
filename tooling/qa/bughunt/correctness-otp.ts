/** correctness bughunt – OTP attempt limit (5) under parallel verify requests. */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, customerOtps } from "@rentweb/db";
import { requestOtp, verifyOtp } from "@rentweb/core/customer";
async function main() {
  const t = await tenantIdOf("demo-shop");
  const phone = "08998" + String(Date.now()).slice(-5);
  const target = { kind: "phone" as const, value: phone };
  const { code } = await tt(t, (tx) => requestOtp(tx, t, target));
  const wrong = (i: number) => String((Number(code) + 1 + i) % 1_000_000).padStart(6, "0");
  await Promise.all(Array.from({ length: 10 }, () => tt(t, (tx) => tx.select({ id: customerOtps.id }).from(customerOtps).limit(1))));
  const res = await Promise.all(Array.from({ length: 40 }, (_, i) => tt(t, (tx) => verifyOtp(tx, t, target, wrong(i))).then((r) => (r.ok ? "OK" : r.error))));
  const tally = res.reduce<Record<string, number>>((m, r) => ((m[r] = (m[r] ?? 0) + 1), m), {});
  const [row] = await tt(t, (tx) => tx.select({ attempts: customerOtps.attempts }).from(customerOtps).where(and(eq(customerOtps.tenantId, t), eq(customerOtps.target, phone))));
  console.log(`40 parallel wrong guesses (limit ${5}) → results`, JSON.stringify(tally), "stored attempts", row?.attempts);
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
