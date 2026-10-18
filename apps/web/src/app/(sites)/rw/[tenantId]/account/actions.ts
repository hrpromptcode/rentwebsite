"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@rentweb/core";
import { OtpRateLimitError, parseOtpTarget, requestOtp, revokeCustomerSession, verifyOtp, unlinkLine, CUSTOMER_COOKIE, LINE_LOGIN_ERROR_MESSAGES, OTP_VERIFY_ERROR_MESSAGES } from "@rentweb/core/customer";
import { cookies } from "next/headers";
import { tenantTx } from "@/lib/tenant";
import { clearCustomerCookie, getCurrentCustomer, requestMeta, setCustomerCookie } from "@/lib/customer";
import { safeNext } from "./safe-next";
import type { UnlinkState } from "./line-link-card";

export type OtpState = { step: "target" | "code"; target?: string; error?: string; devCode?: string };

function waitText(sec: number): string {
  return sec < 90 ? `${sec} วินาที` : `${Math.ceil(sec / 60)} นาที`;
}

function rateLimitMessage(e: OtpRateLimitError): string {
  switch (e.reason) {
    case "cooldown":
      return `ขอรหัสบ่อยเกินไป กรุณารอ ${waitText(e.retryAfterSec)} แล้วลองใหม่`;
    case "locked":
      return `ลองรหัสผิดหลายครั้งเกินไป กรุณาลองใหม่ในอีก ${waitText(e.retryAfterSec)}`;
    default:
      return `ขอรหัสหลายครั้งเกินไป กรุณาลองใหม่ในอีก ${waitText(e.retryAfterSec)}`;
  }
}

export async function requestOtpAction(tenantId: string, _prev: OtpState, form: FormData): Promise<OtpState> {
  const raw = String(form.get("target") ?? "");
  const target = parseOtpTarget(raw);
  if (!target) return { step: "target", error: "กรุณากรอกเบอร์โทรศัพท์หรืออีเมลให้ถูกต้อง" };
  const { ip } = await requestMeta();
  let code: string;
  try {
    ({ code } = await tenantTx(tenantId, (tx) => requestOtp(tx, tenantId, target, { ip })));
  } catch (e) {
    if (e instanceof OtpRateLimitError) return { step: "target", error: rateLimitMessage(e) };
    throw e;
  }
  // TODO: send via SMS / email / LINE provider. In development the code is shown inline.
  return { step: "code", target: target.value, devCode: process.env.NODE_ENV !== "production" ? code : undefined };
}

export async function verifyOtpAction(tenantId: string, next: string, _prev: OtpState, form: FormData): Promise<OtpState> {
  const schema = z.object({ target: z.string().min(3), code: z.string().regex(/^\d{6}$/), name: z.string().max(120).optional() });
  const parsed = schema.safeParse({ target: form.get("target"), code: form.get("code"), name: form.get("name") || undefined });
  if (!parsed.success) return { step: "code", target: String(form.get("target") ?? ""), error: "กรอกรหัส 6 หลักให้ถูกต้อง" };
  const target = parseOtpTarget(parsed.data.target);
  if (!target) return { step: "target", error: "ข้อมูลไม่ถูกต้อง" };
  const meta = await requestMeta();
  const result = await tenantTx(tenantId, (tx) => verifyOtp(tx, tenantId, target, parsed.data.code, { name: parsed.data.name, ...meta }));
  if (!result.ok) {
    // ADMIN_B2-13: one Thai message per error (incl. "blocked" — the shop suspended this customer), shared with core
    const msg = OTP_VERIFY_ERROR_MESSAGES[result.error] ?? OTP_VERIFY_ERROR_MESSAGES.invalid;
    return { step: result.error === "invalid" ? "code" : "target", target: target.value, error: msg };
  }
  await setCustomerCookie(result.token, result.expiresAt);
  // `next` is a bound argument and comes back from the client – validate it again here
  redirect(safeNext(next));
}

export async function logoutAction(tenantId: string) {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) await tenantTx(tenantId, (tx) => revokeCustomerSession(tx, tenantId, token));
  await clearCustomerCookie();
  redirect("/");
}

/**
 * Account page → "ยกเลิกการเชื่อมต่อ LINE". Refused (Thai message) when LINE is the customer's only way back in;
 * on success the page reloads with ?line=unlinked so the banner confirms it.
 */
export async function unlinkLineAction(tenantId: string, _prev: UnlinkState, _form: FormData): Promise<UnlinkState> {
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect("/account/login");
  const meta = await requestMeta();
  const result = await tenantTx(tenantId, async (tx) => {
    const r = await unlinkLine(tx, tenantId, customer.id);
    if (r.ok) {
      await audit(tx, {
        tenantId,
        actorType: "customer",
        actorId: customer.id,
        action: "customer.line.unlink",
        targetType: "customer",
        targetId: customer.id,
        diff: { lineUserId: customer.lineUserId },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    }
    return r;
  });
  if (!result.ok) return { error: LINE_LOGIN_ERROR_MESSAGES[result.error] };
  redirect("/account?line=unlinked");
}
