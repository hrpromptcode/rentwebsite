import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { listReviews, reviewStatusCounts, type ReviewStatus } from "@rentweb/module-commerce/admin";
import { FilterTabs, Pagination, ReviewStatusBadge, Stars, qs } from "@rentweb/module-commerce/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { assetUrl, fmtDate, fmtNumber } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { ReviewActions } from "./review-actions";

export const metadata: Metadata = { title: "รีวิว" };

const TABS: Array<{ key: ReviewStatus | "all"; label: string }> = [
  { key: "pending", label: "รอตรวจ" },
  { key: "approved", label: "อนุมัติแล้ว" },
  { key: "rejected", label: "ปฏิเสธ" },
  { key: "all", label: "ทั้งหมด" },
];

export default async function ReviewsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; page?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const status = (TABS.some((t) => t.key === sp.status) ? sp.status : "pending") as ReviewStatus | "all";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const base = `/t/${slug}/reviews`;
  const canWrite = hasRole(ctx, "manager");
  const { list, counts } = await tenantTx(ctx.tenant.id, async (tx) => ({ list: await listReviews(tx, ctx.tenant.id, { status, page, perPage: 20 }), counts: await reviewStatusCounts(tx, ctx.tenant.id) }));

  return (
    <div className="space-y-6">
      <PageHeader title="รีวิว" description={`รอตรวจ ${fmtNumber(counts.pending)} · อนุมัติแล้ว ${fmtNumber(counts.approved)} — รีวิวที่อนุมัติจะแสดงบนหน้าสินค้าและคิดคะแนนเฉลี่ย`} />
      <FilterTabs active={status} tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key], href: `${base}${qs({ status: t.key === "pending" ? "" : t.key })}` }))} />

      {list.rows.length === 0 ? (
        <EmptyState icon={Star} title={status === "pending" ? "ไม่มีรีวิวรอตรวจ" : "ไม่มีรีวิวในหมวดนี้"} description={status === "pending" ? "เมื่อลูกค้าเขียนรีวิวบนหน้าสินค้า จะมาปรากฏที่นี่เพื่อให้คุณอนุมัติก่อนแสดงผล" : undefined} />
      ) : (
        <div className="card divide-y py-0">
          {list.rows.map((r) => (
            <article key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:p-5">
              <Link href={`/t/${slug}/products/${r.productId}`} className="flex shrink-0 items-center gap-3 sm:w-52 sm:flex-col sm:items-start">
                <span className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted sm:size-20">{r.productImage ? <img src={assetUrl(r.productImage)} alt="" className="size-full object-cover" loading="lazy" /> : null}</span>
                <span className="line-clamp-2 text-sm font-medium hover:text-primary">{r.productName ?? "สินค้าถูกลบ"}</span>
              </Link>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={r.rating} />
                  <span className="text-sm font-medium">{r.authorName}</span>
                  {r.orderId && <Badge variant="outline">ซื้อจริง</Badge>}
                  <ReviewStatusBadge status={r.status} />
                  <span className="text-xs text-muted-foreground">{fmtDate(r.createdAt, { withTime: true })}</span>
                </div>
                {r.title && <p className="font-medium">{r.title}</p>}
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.body ?? "—"}</p>
                {r.images.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {r.images.map((im, i) => (
                      <a key={i} href={assetUrl(im)} target="_blank" rel="noreferrer" className="size-16 overflow-hidden rounded-lg border">
                        <img src={assetUrl(im)} alt="" className="size-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                {r.reply && (
                  <div className="rounded-lg bg-primary-soft/50 p-3 text-sm">
                    <p className="mb-0.5 text-xs font-medium text-primary">ร้านค้าตอบกลับ · {fmtDate(r.repliedAt)}</p>
                    <p className="whitespace-pre-wrap">{r.reply}</p>
                  </div>
                )}
                <ReviewActions slug={slug} review={{ id: r.id, status: r.status, reply: r.reply ?? "" }} canWrite={canWrite} canReply={hasRole(ctx, "staff")} />
              </div>
            </article>
          ))}
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={{ status: status === "pending" ? "" : status }} label="รีวิว" />
        </div>
      )}
    </div>
  );
}
