import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sanitizeNext } from "@/lib/safe-next";
import { getSession } from "@/lib/session";
import { AuthSplit, ShopWindows } from "../_brand/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = sanitizeNext((await searchParams).next);
  const session = await getSession();
  if (session) redirect(next ?? "/");
  return (
    <AuthSplit panel={<ShopWindows kicker="(01) — Back to your shop" statement={"หน้าร้านของคุณ\nเปิดไฟรออยู่แล้ว"} />}>
      <LoginForm next={next ?? undefined} />
    </AuthSplit>
  );
}
