import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx } from "@/lib/tenant";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "ตั้งค่า" };

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  return (
    <div className="space-y-6">
      <PageHeader title="ตั้งค่า" description={`ข้อมูลร้าน ช่องทางรับเงิน โดเมน ทีม และแพ็กเกจของ ${ctx.tenant.name}`} />
      <SettingsTabs slug={slug} />
      <div className="max-w-4xl">{children}</div>
    </div>
  );
}
