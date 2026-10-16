"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { OtpRateLimitError, parseOtpTarget, requestOtp, revokeCustomerSession, verifyOtp, CUSTOMER_COOKIE } from "@rentweb/core/customer";
import { cookies } from "next/headers";
import { tenantTx } from "@/lib/tenant";
import { clearCustomerCookie, requestMeta, setCustomerCookie } from "@/lib/customer";
import { safeNext } from "./safe-next";

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
    const msg =
      result.error === "expired"
        ? "รหัสหมดอายุ กรุณาขอรหัสใหม่"
        : result.error === "too_many"
          ? "ลองผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่"
          : result.error === "locked"
            ? "ลองรหัสผิดหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง"
            : "รหัสไม่ถูกต้อง";
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
