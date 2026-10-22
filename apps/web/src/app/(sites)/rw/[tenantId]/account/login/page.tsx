import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, BedDouble, CalendarCheck2, KeyRound, Package, Ticket, Zap } from "lucide-react";
import { LINE_LOGIN_ERROR_MESSAGES, isLineLoginEnabled, isLineLoginErrorCode } from "@rentweb/core/customer";
import { getPublishedPage, getRuntime, makeT } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { requestOtpAction, verifyOtpAction } from "../actions";
import { OtpForm } from "./otp-form";
import { safeNext } from "../safe-next";
import { LineLoginButton } from "../line-button";
import { AuthStyles } from "./auth-styles";

export const metadata = { title: "เข้าสู่ระบบ" };

type Search = { next?: string | string[]; error?: string | string[] };

/** ?error=line_<code> set by /api/auth/line/callback → Thai message (unknown values are ignored, never echoed). */
function lineErrorMessage(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.startsWith("line_")) return null;
  const code = v.slice(5);
  return isLineLoginErrorCode(code) ? LINE_LOGIN_ERROR_MESSAGES[code] : LINE_LOGIN_ERROR_MESSAGES.unknown;
}

/** The shop's own hero photo (home page) for the brand panel; a theme gradient when there is none. */
async function brandPhoto(tenantId: string): Promise<{ url: string; alt: string } | null> {
  const home = await getPublishedPage(tenantId, "home").catch(() => null);
  for (const s of home?.sections ?? []) {
    if (s.hidden) continue;
    const img = (s.props as { image?: { url?: string; alt?: string } } | undefined)?.image;
    if ((s.type === "hero" || s.type === "stay-search" || s.type === "event-hero") && img?.url) return { url: img.url, alt: img.alt ?? "" };
  }
  return null;
}

/**
 * Customer sign-in (operational route: no 3D, no scroll effects). A focused split card: the shop's brand panel (its
 * own hero photo under a theme-tinted scrim, name, what an account is for) and the sign-in column — LINE first when
 * enabled, then the OTP form. Journey hooks: #otp-target, the FIRST `form button[type=submit]` is the OTP submit,
 * #otp-code, #otp-name, testids line-login-button / line-login-error.
 */
export default async function LoginPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Search> }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const customer = await getCurrentCustomer(tenantId);
  if (customer) redirect(next);
  const [runtime, photo] = await Promise.all([getRuntime(tenantId), brandPhoto(tenantId)]);
  const t = makeT(runtime?.config.locale ?? "th");
  const lineEnabled = isLineLoginEnabled(runtime?.config.settings);
  const lineError = lineErrorMessage(sp.error);
  const modules = runtime?.config.modules ?? [];
  const name = runtime?.config.name ?? "";

  const perks = [
    modules.includes("commerce") && { icon: Package, text: "ติดตามคำสั่งซื้อและประวัติการซื้อ" },
    modules.includes("booking") && { icon: CalendarCheck2, text: "ดูและจัดการคิวที่จองไว้" },
    modules.includes("rental") && { icon: BedDouble, text: "ข้อมูลการเข้าพักของคุณ" },
    modules.includes("events") && { icon: Ticket, text: "บัตรเข้างานทุกใบในที่เดียว" },
    modules.includes("topup") && { icon: Zap, text: "ประวัติการเติมและกระเป๋าเงิน" },
    { icon: KeyRound, text: "ไม่ต้องจำรหัสผ่าน ยืนยันด้วยรหัสครั้งเดียว" },
  ]
    .filter(Boolean)
    .slice(0, 3) as Array<{ icon: typeof Package; text: string }>;

  const request = requestOtpAction.bind(null, tenantId);
  const verify = verifyOtpAction.bind(null, tenantId, next);

  return (
    <section className="container-x pt-20 pb-14 md:pt-28 md:pb-20">
      <AuthStyles />
      <div className="rw-auth-card mx-auto grid max-w-6xl overflow-hidden rounded-[var(--radius-2xl)] border border-border bg-card text-card-foreground shadow-float lg:min-h-[min(42rem,calc(100svh-9rem))] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        {/* brand panel — decorative + a short summary of what the account gives */}
        <div className="rw-auth-brand relative isolate flex min-h-52 flex-col justify-between overflow-hidden p-6 text-white sm:min-h-64 sm:p-8 lg:min-h-0 lg:p-12">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt="" aria-hidden className="rw-auth-photo absolute inset-0 -z-20 size-full object-cover" fetchPriority="high" />
          ) : (
            <span aria-hidden className="rw-auth-gradient absolute inset-0 -z-20" />
          )}
          <span aria-hidden className="rw-auth-scrim absolute inset-0 -z-10" />
          <span aria-hidden className="rw-auth-grain pointer-events-none absolute inset-0 -z-10" />
          <div className="flex items-center justify-between gap-4">
            <span className="mono-label text-white/80">Member access</span>
            <span className="mono-label flex items-center gap-2 text-white/80">
              <span aria-hidden className="rw-auth-dot size-1.5 rounded-full bg-[var(--glow,#fff)]" />
              {lineEnabled ? "LINE · OTP" : "OTP"}
            </span>
          </div>
          <div className="mt-10 lg:mt-0">
            <p className="rw-auth-name font-heading text-step-4 leading-[1.15] font-semibold text-balance lg:text-step-5" data-script={/[฀-๿]/.test(name) ? "thai" : "latin"}>
              {name}
            </p>
            <ul className="mt-6 hidden gap-3 text-sm text-white/85 sm:grid lg:mt-8 lg:text-base">
              {perks.map((p) => (
                <li key={p.text} className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur-sm">
                    <p.icon aria-hidden className="size-4" />
                  </span>
                  {p.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* sign-in column */}
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
          <p className="rw-auth-rise mono-label text-muted-foreground" style={{ ["--d" as string]: "0ms" }}>
            {lineEnabled ? "01 — เลือกวิธีเข้าสู่ระบบ" : "01 — ยืนยันตัวตน"}
          </p>
          <h1 className="rw-auth-rise mt-4 font-heading text-step-3 leading-[1.25] font-semibold text-balance" style={{ ["--d" as string]: "60ms" }}>
            {t("auth.loginTitle")}
          </h1>
          <p className="rw-auth-rise mt-3 mb-8 max-w-md text-muted-foreground" style={{ ["--d" as string]: "120ms" }}>
            {lineEnabled ? "เข้าสู่ระบบด้วย LINE หรือยืนยันตัวตนด้วยรหัส OTP ไม่ต้องตั้งรหัสผ่าน" : "ยืนยันตัวตนด้วยรหัส OTP ไม่ต้องตั้งรหัสผ่าน"}
          </p>
          {lineError && (
            <p role="alert" data-testid="line-login-error" className="mb-6 flex items-start gap-2 rounded-[var(--radius-lg)] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{lineError}</span>
            </p>
          )}
          {lineEnabled && (
            <div className="rw-auth-rise mb-7" style={{ ["--d" as string]: "180ms" }}>
              <LineLoginButton next={next} className="h-14 rounded-full text-base">
                {t("auth.lineLogin")}
              </LineLoginButton>
              <div className="relative mt-7 flex items-center gap-4 text-xs text-muted-foreground" role="separator" aria-label="หรือ">
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span>หรือรับรหัส OTP</span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
            </div>
          )}
          <div className="rw-auth-rise" style={{ ["--d" as string]: lineEnabled ? "240ms" : "180ms" }}>
            <OtpForm
              requestAction={request}
              verifyAction={verify}
              labels={{ title: t("auth.loginTitle"), phone: t("auth.phone"), sendOtp: t("auth.sendOtp"), enterOtp: t("auth.enterOtp"), verify: t("auth.verify"), otpSent: t("auth.otpSent"), name: t("checkout.name") }}
            />
          </div>
          <p className="mt-8 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">
            เราใช้เบอร์โทรหรืออีเมลเพื่อยืนยันตัวตนและแจ้งสถานะคำสั่งซื้อเท่านั้น ·{" "}
            <Link href="/privacy" className="inline-flex min-h-6 items-center underline underline-offset-4 hover:text-foreground">
              นโยบายความเป็นส่วนตัว
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
