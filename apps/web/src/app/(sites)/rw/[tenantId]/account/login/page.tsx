import { redirect } from "next/navigation";
import { getRuntime, makeT } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { requestOtpAction, verifyOtpAction } from "../actions";
import { OtpForm } from "./otp-form";

export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<{ next?: string }> }) {
  const { tenantId } = await params;
  const { next = "/account" } = await searchParams;
  const customer = await getCurrentCustomer(tenantId);
  if (customer) redirect(next);
  const runtime = await getRuntime(tenantId);
  const t = makeT(runtime?.config.locale ?? "th");

  const request = requestOtpAction.bind(null, tenantId);
  const verify = verifyOtpAction.bind(null, tenantId, next);

  return (
    <section className="container-x flex min-h-[70vh] items-center justify-center pt-24 pb-16">
      <div className="card w-full max-w-md p-8">
        <h1 className="font-heading text-2xl font-semibold">{t("auth.loginTitle")}</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">ยืนยันตัวตนด้วยรหัส OTP ไม่ต้องตั้งรหัสผ่าน</p>
        <OtpForm
          requestAction={request}
          verifyAction={verify}
          labels={{ title: t("auth.loginTitle"), phone: t("auth.phone"), sendOtp: t("auth.sendOtp"), enterOtp: t("auth.enterOtp"), verify: t("auth.verify"), otpSent: t("auth.otpSent"), name: t("checkout.name") }}
        />
      </div>
    </section>
  );
}
