/**
 * SEC-002 regression: an owner may only lift a suspension they made themselves; platform suspensions,
 * cancellations and past_due stay until RentWeb staff / billing clears them.
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/SEC-002-verify.ts
 * Part 1 = pure rule checks (apps/admin/src/lib/tenant-status.ts); part 2 = live server-action probes
 * against the dev admin (tenant sec-u1shop, owner u1 from qa/bughunt/security-creds.json).
 */
// @ts-expect-error untyped helper module
import { ADMIN, actionId, creds, db } from "../security-http.mjs";

/** like security-http callAction but keeps the whole RSC body (revalidating actions put the tree before the result) */
async function callAction(base: string, cookie: string, id: string, args: unknown[], path: string) {
  const r = await fetch(`${base}${path}`, { method: "POST", redirect: "manual", headers: { "next-action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: base, cookie }, body: JSON.stringify(args) });
  return { status: r.status, text: await r.text() };
}
import { ownStatusTransition, reactivationTarget, type StatusEvent } from "../../../../apps/admin/src/lib/tenant-status";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};

/* ----------------------------- part 1: rules ----------------------------- */
const now = new Date("2026-10-16T10:00:00Z");
const past = new Date("2026-10-10T00:00:00Z");
const future = new Date("2026-10-30T00:00:00Z");
const ev = (action: string, diff: Record<string, unknown>, actorType = "user"): StatusEvent => ({ action, actorType, diff, createdAt: new Date("2026-10-15T00:00:00Z") });
const base = { trialEndsAt: future, suspendedAt: new Date("2026-10-15T00:00:00Z"), hasPaidSubscription: false, now };

check("platform suspension cannot be lifted by owner", !ownStatusTransition("reactivate", { ...base, status: "suspended", lastEvent: ev("tenant.status.change", { from: "active", to: "suspended" }, "superadmin") }).ok);
check("suspension with no audit trail is treated as platform", !ownStatusTransition("reactivate", { ...base, status: "suspended", lastEvent: null }).ok);
check("cancelled cannot be reactivated by owner", !ownStatusTransition("reactivate", { ...base, status: "cancelled", lastEvent: ev("tenant.self.cancel", { from: "active", to: "cancelled" }) }).ok);
check("past_due cannot be reactivated by owner", !ownStatusTransition("reactivate", { ...base, status: "past_due", lastEvent: null }).ok);
check("active cannot be 'reactivated'", !ownStatusTransition("reactivate", { ...base, status: "active", lastEvent: null }).ok);
const selfSusp = (from: string, suspendedAt = base.suspendedAt) => ev("tenant.self.suspend", { from, to: "suspended", suspendedAt: suspendedAt.toISOString() });
const r1 = ownStatusTransition("reactivate", { ...base, status: "suspended", lastEvent: selfSusp("active") });
check("self-suspension from active -> active", r1.ok && r1.next === "active", r1);
const r2 = ownStatusTransition("reactivate", { ...base, status: "suspended", lastEvent: selfSusp("trialing") });
check("self-suspension inside trial -> trialing", r2.ok && r2.next === "trialing", r2);
const r3 = ownStatusTransition("reactivate", { ...base, trialEndsAt: past, status: "suspended", lastEvent: selfSusp("past_due") });
check("past_due -> self-suspend -> reactivate stays past_due", r3.ok && r3.next === "past_due", r3);
const r4 = ownStatusTransition("reactivate", { ...base, trialEndsAt: past, status: "suspended", lastEvent: selfSusp("trialing") });
check("expired trial, no paid subscription -> past_due (not active)", r4.ok && r4.next === "past_due", r4);
const r5 = ownStatusTransition("reactivate", { ...base, trialEndsAt: past, hasPaidSubscription: true, status: "suspended", lastEvent: selfSusp("trialing") });
check("expired trial with paid subscription -> active", r5.ok && r5.next === "active", r5);
const r6 = ownStatusTransition("reactivate", { ...base, status: "suspended", suspendedAt: new Date("2026-10-15T05:00:00Z"), lastEvent: selfSusp("active") });
check("re-suspended later without audit (suspended_at mismatch) -> platform", !r6.ok, r6);
check("suspend from cancelled refused", !ownStatusTransition("suspend", { ...base, status: "cancelled", lastEvent: null }).ok);
check("suspend from past_due allowed", ownStatusTransition("suspend", { ...base, status: "past_due", lastEvent: null }).ok);
check("reactivationTarget(null, expired, false) = past_due", reactivationTarget(null, past, false, now) === "past_due");

/* -------------------------- part 2: live probes -------------------------- */
const c = creds();
const sql = db();
const slug = "sec-u1shop";
const [orig] = await sql`select id, status, trial_ends_at, suspended_at from tenants where slug = ${slug}`;
if (!orig || !c.u1?.cookie || !c.admin?.cookie) {
  console.log("SKIP live probes (no sec-u1shop / creds)");
} else {
  const tid = orig.id as string;
  const status = async () => (await sql`select status from tenants where id = ${tid}`)[0].status as string;
  const asAdmin = (st: string, reason?: string) => callAction(ADMIN, c.admin.cookie, actionId("updateTenantStatus", "console"), [{ tenantId: tid, status: st, ...(reason ? { reason } : {}) }], `/console/tenants/${tid}`);
  const owner = (name: string) => callAction(ADMIN, c.u1.cookie, actionId(name, "settings"), [slug], `/t/${slug}/settings/danger`);
  const okOf = (r: { text: string }) => /"ok":true/.test(r.text) ? true : /"ok":false/.test(r.text) ? false : null;
  try {
    await sql`update tenants set trial_ends_at = now() - interval '3 days' where id = ${tid}`;
    await asAdmin("suspended", "QA: platform suspension");
    let r = await owner("reactivateOwnTenant");
    check("live: platform suspension -> owner reactivate refused", okOf(r) === false && (await status()) === "suspended", { ok: okOf(r), status: await status() });
    const [a] = await sql`select diff from audit_logs where tenant_id = ${tid} and action = 'tenant.status.change' order by created_at desc limit 1`;
    check("live: platform suspension records by+reason", a?.diff?.by === "platform" && a?.diff?.reason === "QA: platform suspension", a?.diff);

    await asAdmin("cancelled");
    r = await owner("reactivateOwnTenant");
    check("live: cancelled -> owner reactivate refused", okOf(r) === false && (await status()) === "cancelled", { ok: okOf(r), status: await status() });

    await asAdmin("past_due");
    r = await owner("reactivateOwnTenant");
    check("live: past_due -> owner reactivate refused", okOf(r) === false && (await status()) === "past_due", { ok: okOf(r), status: await status() });
    r = await owner("suspendOwnTenant");
    check("live: past_due -> owner suspend ok", okOf(r) === true && (await status()) === "suspended", { ok: okOf(r), status: await status() });
    r = await owner("reactivateOwnTenant");
    check("live: ...then owner reactivate lands in past_due (not active)", okOf(r) === true && (await status()) === "past_due", { ok: okOf(r), status: await status() });

    await asAdmin("active");
    await owner("suspendOwnTenant");
    r = await owner("reactivateOwnTenant");
    check("live: owner can lift their own suspension (active)", okOf(r) === true && (await status()) === "active", { ok: okOf(r), status: await status() });
  } finally {
    await sql`update tenants set status = ${orig.status}, trial_ends_at = ${orig.trial_ends_at}, suspended_at = ${orig.suspended_at} where id = ${tid}`;
  }
}
console.log(fails === 0 ? "PASS SEC-002 (all checks)" : `FAIL SEC-002 (${fails} failing)`);
await sql.end({ timeout: 2 });
process.exitCode = fails === 0 ? 0 : 1;
