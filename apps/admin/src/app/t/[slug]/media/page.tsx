import type { Metadata } from "next";
import { desc, eq, media } from "@rentweb/db";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { MediaGrid } from "./media-grid";

export const metadata: Metadata = { title: "คลังสื่อ" };

export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const rows = await tenantTx(ctx.tenant.id, (tx) => tx.select().from(media).where(eq(media.tenantId, ctx.tenant.id)).orderBy(desc(media.createdAt)).limit(300));
  const totalBytes = rows.reduce((a, r) => a + r.size, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="คลังสื่อ" description={`รูปภาพและไฟล์ที่ใช้บนเว็บ · ${rows.length} ไฟล์ · ${(totalBytes / 1024 / 1024).toFixed(1)} MB`} />
      <MediaGrid
        slug={slug}
        items={rows.map((r) => ({ id: r.id, url: r.url, mime: r.mime, size: r.size, alt: r.alt ?? "", folder: r.folder, createdAt: r.createdAt.toISOString() }))}
        storefrontUrl={ctx.storefrontUrl}
        canUpload={hasRole(ctx, "staff")}
        canDelete={hasRole(ctx, "manager")}
      />
    </div>
  );
}
