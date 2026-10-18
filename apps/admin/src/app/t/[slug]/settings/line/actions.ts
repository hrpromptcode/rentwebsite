"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, getAdminDb, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { clearLineLoginCredentials, getLineLoginCredentials, getLineLoginStatus, isLineLoginEnabled, lineChannelIdError, lineChannelSecretError, lineCredentialWarnings, lineEndpoints, saveLineLoginCredentials } from "@rentweb/core/customer";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, tenantHostnames, tenantTx, type TenantCtx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

/**
 * Settings > LINE Login. Credentials go to tenant_secrets (encrypted, secret write-only) through @rentweb/core/customer;
 * the on/off switch is tenants.settings.lineLogin.enabled (cached with the tenant config → invalidateTenant after writes).
 */

export interface LineLoginInput {
  enabled: boolean;
  channelId: string;
  /** empty = keep the stored secret */
  channelSecret: string;
}

export type LineProbeResult = "rejected" | "reachable" | "inconclusive" | "unreachable";

export interface LineTestReport {
  channelId: string;
  /** the stored secret was used (nothing new typed) */
  usedStoredSecret: boolean;
  warnings: string[];
  probe: LineProbeResult;
  probeDetail: string;
  endpoint: string;
}

const inputSchema = z.object({
  enabled: z.boolean(),
  channelId: z.string().trim().max(40, "Channel ID ยาวเกินไป"),
  channelSecret: z.string().trim().max(200, "Channel secret ยาวเกินไป"),
});

const CREDS_REQUIRED = "กรอก Channel ID และ Channel secret ให้ครบก่อนเปิดใช้งาน LINE Login";

function actor(ctx: TenantCtx) {
  return { actorType: ctx.impersonating ? ("superadmin" as const) : ("user" as const), actorId: ctx.userId };
}

async function refresh(ctx: TenantCtx) {
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  revalidatePath(`/t/${ctx.tenant.slug}/settings/line`);
  revalidatePath(`/t/${ctx.tenant.slug}`, "layout");
}

async function setEnabledFlag(ctx: TenantCtx, enabled: boolean): Promise<boolean> {
  const prev = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  if (isLineLoginEnabled(prev) === enabled) return false;
  const lineLogin = { ...((prev.lineLogin ?? {}) as Record<string, unknown>), enabled };
  await getAdminDb()
    .update(tenants)
    .set({ settings: { ...prev, lineLogin } })
    .where(eq(tenants.id, ctx.tenant.id));
  return true;
}

export async function saveLineLogin(slug: string, input: LineLoginInput): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const { enabled, channelId, channelSecret } = parsed.data;

  if (channelId) {
    const e = lineChannelIdError(channelId);
    if (e) return { ok: false, error: e };
  }
  if (channelSecret) {
    const e = lineChannelSecretError(channelSecret);
    if (e) return { ok: false, error: e };
    if (!channelId) return { ok: false, error: "กรุณากรอก Channel ID ด้วย" };
  }
  const status = await tenantTx(ctx.tenant.id, (tx) => getLineLoginStatus(tx, ctx.tenant.id));
  const hasSecret = !!channelSecret || status.secretHint !== null;
  // never switch the storefront button on while /api/auth/line/start would only fail with invalid_credentials
  if (enabled && !(channelId && hasSecret)) return { ok: false, error: CREDS_REQUIRED };

  if (channelId) {
    await tenantTx(ctx.tenant.id, (tx) => saveLineLoginCredentials(tx, ctx.tenant.id, { channelId, channelSecret: channelSecret || null }));
  }
  await setEnabledFlag(ctx, enabled);
  await auditLog({
    tenantId: ctx.tenant.id,
    ...actor(ctx),
    action: "settings.update",
    targetType: "tenant",
    targetId: ctx.tenant.id,
    diff: { section: "line_login", enabled, channelId: channelId || undefined, secretChanged: !!channelSecret },
  });
  await refresh(ctx);
  return { ok: true, message: enabled ? "บันทึกแล้ว — ลูกค้าเข้าสู่ระบบด้วย LINE ได้แล้ว" : "บันทึกแล้ว — LINE Login ยังปิดใช้งานอยู่" };
}

/** Removes the stored Channel ID / secret and switches LINE Login off. Customers keep their LINE link for later. */
export async function clearLineLogin(slug: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  await tenantTx(ctx.tenant.id, (tx) => clearLineLoginCredentials(tx, ctx.tenant.id));
  await setEnabledFlag(ctx, false);
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "settings.update", targetType: "tenant", targetId: ctx.tenant.id, diff: { section: "line_login", cleared: true, enabled: false } });
  await refresh(ctx);
  return { ok: true, message: "ลบข้อมูลการเชื่อมต่อ LINE Login แล้ว และปิดใช้งานให้แล้ว" };
}

/**
 * "ทดสอบการตั้งค่า": validates the shapes (Thai errors), lists soft warnings, then asks the token endpoint with a dummy
 * authorization code. `invalid_client` = LINE (or the dev mock) rejected the Channel ID / secret pair; `invalid_grant` =
 * the endpoint answered normally. Real LINE checks the code before the secret, so the latter proves reachability and
 * endpoint configuration, not the secret itself — the report says so. Nothing is stored by this action.
 */
export async function testLineLogin(slug: string, input: { channelId: string; channelSecret: string }): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const channelId = String(input.channelId ?? "").trim();
  const typedSecret = String(input.channelSecret ?? "").trim();
  const idErr = lineChannelIdError(channelId);
  if (idErr) return { ok: false, error: idErr };
  if (typedSecret) {
    const e = lineChannelSecretError(typedSecret);
    if (e) return { ok: false, error: e };
  }
  const stored = typedSecret ? null : await tenantTx(ctx.tenant.id, (tx) => getLineLoginCredentials(tx, ctx.tenant.id));
  const secret = typedSecret || stored?.channelSecret || null;
  if (!secret) return { ok: false, error: "ยังไม่มี Channel secret — กรอก Channel secret แล้วกดทดสอบอีกครั้ง" };

  const warnings = lineCredentialWarnings(channelId, secret);
  const endpoint = lineEndpoints().token;
  const { probe, probeDetail } = await probeLineToken(endpoint, channelId, secret);
  const report: LineTestReport = { channelId, usedStoredSecret: !typedSecret, warnings, probe, probeDetail, endpoint };
  if (probe === "rejected") return { ok: false, error: "LINE ปฏิเสธ Channel ID หรือ Channel secret — ตรวจสอบค่าที่คัดลอกมา", data: report } as ActionResult;
  const headline = probe === "reachable" ? "รูปแบบถูกต้องและติดต่อเซิร์ฟเวอร์ LINE ได้ — ยืนยันขั้นสุดท้ายด้วยการทดลองเข้าสู่ระบบจากหน้าร้าน" : probe === "unreachable" ? "รูปแบบถูกต้อง แต่ติดต่อเซิร์ฟเวอร์ LINE ไม่ได้ในขณะนี้" : "รูปแบบถูกต้อง แต่ LINE ตอบกลับไม่ตรงตามคาด";
  return { ok: true, message: warnings.length ? `${headline} (มีข้อควรตรวจสอบ ${warnings.length} รายการ)` : headline, data: report };
}

async function probeLineToken(endpoint: string, channelId: string, channelSecret: string): Promise<{ probe: LineProbeResult; probeDetail: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: "rentweb-credential-check",
    redirect_uri: "https://rentweb.invalid/api/auth/line/callback",
    client_id: channelId,
    client_secret: channelSecret,
  });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(), signal: ac.signal, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = String(json.error ?? "");
    if (err === "invalid_client" || res.status === 401) {
      return { probe: "rejected", probeDetail: "เซิร์ฟเวอร์ LINE ปฏิเสธการยืนยันตัวตนของ channel (invalid_client) — ตรวจสอบว่าคัดลอก Channel ID และ Channel secret จาก channel ประเภท LINE Login ครบทุกตัวอักษร" };
    }
    if (err === "invalid_grant") {
      return { probe: "reachable", probeDetail: "เซิร์ฟเวอร์ LINE ตอบกลับตามปกติ (ปฏิเสธรหัสทดสอบ: invalid_grant) — LINE ตรวจรหัสก่อนตรวจ Channel secret จึงยืนยัน secret ได้ด้วยการทดลองเข้าสู่ระบบจริงเท่านั้น" };
    }
    return { probe: "inconclusive", probeDetail: `เซิร์ฟเวอร์ LINE ตอบกลับ ${res.status}${err ? ` ${err}` : ""} — บันทึกแล้วทดลองเข้าสู่ระบบจากหน้าร้านเพื่อยืนยัน` };
  } catch (e) {
    const why = e instanceof Error && e.name === "AbortError" ? "หมดเวลา 8 วินาที" : "เชื่อมต่อไม่ได้";
    return { probe: "unreachable", probeDetail: `ติดต่อ ${endpoint} ไม่ได้ (${why}) — ตรวจสอบอินเทอร์เน็ตของเซิร์ฟเวอร์ หรือค่า LINE_API_BASE` };
  } finally {
    clearTimeout(timer);
  }
}
