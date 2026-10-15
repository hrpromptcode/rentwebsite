"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseOtpTarget, requestOtp, revokeCustomerSession, verifyOtp, CUSTOMER_COOKIE } from "@rentweb/core/customer";
import { cookies } from "next/headers";
import { tenantTx } from "@/lib/tenant";
import { clearCustomerCookie, requestMeta, setCustomerCookie } from "@/lib/customer";

export type OtpState = { step: "target" | "code"; target?: string; error?: string; devCode?: string };

export async function requestOtpAction(tenantId: string, _prev: OtpState, form: FormData): Promise<OtpState> {
  const raw = String(form.get("target") ?? "");
  const target = parseOtpTarget(raw);
  if (!target) return { step: "target", error: "กรุณากรอกเบอร์โทรศัพท์หรืออีเมลให้ถูกต้อง" };
  const { code } = await tenantTx(tenantId, (tx) => requestOtp(tx, tenantId, target));
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
    const msg = result.error === "expired" ? "รหัสหมดอายุ กรุณาขอรหัสใหม่" : result.error === "too_many" ? "ลองผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่" : "รหัสไม่ถูกต้อง";
    return { step: result.error === "invalid" ? "code" : "target", target: target.value, error: msg };
  }
  await setCustomerCookie(result.token, result.expiresAt);
  redirect(next.startsWith("/") ? next : "/account");
}

export async function logoutAction(tenantId: string) {
  const jar = await cookies();
  const token = jar.get(CUSTOMER_COOKIE)?.value;
  if (token) await tenantTx(tenantId, (tx) => revokeCustomerSession(tx, tenantId, token));
  await clearCustomerCookie();
  redirect("/");
}
