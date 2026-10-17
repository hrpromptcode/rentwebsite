import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { LINE_LOGIN_ERROR_MESSAGES, isLineLoginEnabled, isLineLoginErrorCode } from "@rentweb/core/customer";
import { getRuntime, makeT } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { requestOtpAction, verifyOtpAction } from "../actions";
import { OtpForm } from "./otp-form";
import { safeNext } from "../safe-next";
import { LineLoginButton } from "../line-button";

export const metadata = { title: "เข้าสู่ระบบ" };

type Search = { next?: string | string[]; error?: string | string[] };

/** ?error=line_<code> set by /api/auth/line/callback → Thai message (unknown values are ignored, never echoed). */
function lineErrorMessage(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("line_")) return null;
  const code = v.slice(5);
  return isLineLoginErrorCode(code) ? LINE_LOGIN_ERROR_MESSAGES[code] : LINE_LOGIN_ERROR_MESSAGES.unknown;
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Search> }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const customer = await getCurrentCustomer(tenantId);
  if (customer) redirect(next);
  const runtime = await getRuntime(tenantId);
  const t = makeT(runtime?.config.locale ?? "th");
  const lineEnabled = isLineLoginEnabled(runtime?.config.settings);
  const lineError = lineErrorMessage(sp.error);

  const request = requestOtpAction.bind(null, tenantId);
  const verify = verifyOtpAction.bind(null, tenantId, next);

  return (
    <section className="container-x flex min-h-[70vh] items-center justify-center pt-24 pb-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-heading text-2xl font-semibold">{t("auth.loginTitle")}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">{lineEnabled ? "เข้าสู่ระบบด้วย LINE หรือยืนยันตัวตนด้วยรหัส OTP ไม่ต้องตั้งรหัสผ่าน" : "ยืนยันตัวตนด้วยรหัส OTP ไม่ต้องตั้งรหัสผ่าน"}</p>
        {lineError && (
          <p role="alert" data-testid="line-login-error" className="mb-5 flex items-start gap-2 rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{lineError}</span>
          </p>
        )}
        {lineEnabled && (
          <div className="mb-6">
            <LineLoginButton next={next}>{t("auth.lineLogin")}</LineLoginButton>
            <div className="relative mt-6 text-center text-xs text-muted-foreground" role="separator" aria-label="หรือ">
              <span className="absolute inset-x-0 top-1/2 border-t border-border" aria-hidden="true" />
              <span className="relative bg-card px-3">หรือรับรหัส OTP</span>
            </div>
          </div>
        )}
        <OtpForm
          requestAction={request}
          verifyAction={verify}
          labels={{ title: t("auth.loginTitle"), phone: t("auth.phone"), sendOtp: t("auth.sendOtp"), enterOtp: t("auth.enterOtp"), verify: t("auth.verify"), otpSent: t("auth.otpSent"), name: t("checkout.name") }}
        />
      </div>
    </section>
  );
}
