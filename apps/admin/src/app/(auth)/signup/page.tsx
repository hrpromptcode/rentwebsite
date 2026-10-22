import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq, getAdminDb, gt, isNull, tenantInvitations, tenants } from "@rentweb/db";
import { sanitizeNext } from "@/lib/safe-next";
import { getSession } from "@/lib/session";
import { AuthSplit, ShopWindows } from "../_brand/brand";
import { SignupForm, type SignupInvite } from "./signup-form";

export const metadata: Metadata = { title: "สมัครใช้งาน" };

/** ADMIN_B2-12: an invitee arriving from /login?next=/invite/<token> keeps the invitation through sign-up. */
async function inviteFor(next: string | null): Promise<SignupInvite | null> {
  const token = next ? /^\/invite\/([A-Za-z0-9_-]{8,200})$/.exec(next)?.[1] : undefined;
  if (!token) return null;
  const [inv] = await getAdminDb()
    .select({ email: tenantInvitations.email, tenantName: tenants.name })
    .from(tenantInvitations)
    .innerJoin(tenants, eq(tenants.id, tenantInvitations.tenantId))
    .where(and(eq(tenantInvitations.token, token), isNull(tenantInvitations.acceptedAt), gt(tenantInvitations.expiresAt, new Date())))
    .limit(1);
  return inv ? { email: inv.email, tenantName: inv.tenantName } : null;
}

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; template?: string }> }) {
  const sp = await searchParams;
  // /signup?template=<key> is shorthand for /signup?next=/onboarding?template=<key> (onboarding preselects it)
  const template = typeof sp.template === "string" && /^[a-z0-9-]{2,40}$/.test(sp.template) ? sp.template : null;
  const next = sanitizeNext(sp.next) ?? (template ? `/onboarding?template=${template}` : null);
  const session = await getSession();
  if (session) redirect(next ?? "/onboarding");
  const invite = await inviteFor(next);
  return (
    <AuthSplit panel={<ShopWindows kicker="(01) — Open your shop" statement={"เปิดเว็บร้านของคุณ\nวันนี้ ไม่ต้องเขียนโค้ด"} />}>
      <SignupForm next={next ?? undefined} invite={invite} />
    </AuthSplit>
  );
}
