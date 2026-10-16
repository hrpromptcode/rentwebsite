import type { Metadata } from "next";
import Link from "next/link";
import { Search, ShieldBan, X } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { listBlacklist } from "@rentweb/module-topup/admin";
import { BLACKLIST_KIND_LABEL } from "@rentweb/module-topup/admin/labels";
import { FilterTabs, Pagination, qs } from "@rentweb/module-topup/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDate } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { BlacklistForm, RemoveBlacklistButton } from "./blacklist-form";

export const metadata: Metadata = { title: "บัญชีดำ" };

type Kind = "phone" | "ip" | "uid" | "email" | "device";
const KINDS = Object.keys(BLACKLIST_KIND_LABEL) as Kind[];

export default async function TopupBlacklistPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ q?: string; kind?: string; value?: string; page?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  const q = sp.q?.trim() ?? "";
  const kind = KINDS.includes(sp.kind as Kind) ? (sp.kind as Kind) : null;
  // ?kind=uid&value=… comes from the order page ("บล็อก UID นี้") → prefill the form, list stays unfiltered by kind
  const prefill = sp.value?.trim().slice(0, 200) ?? "";
  const listKind = prefill ? null : kind;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const base = `/t/${slug}/topup/blacklist`;
  const list = await tenantTx(ctx.tenant.id, (tx) => listBlacklist(tx, ctx.tenant.id, { q, kind: listKind, page, perPage: 25 }));
  const canWrite = hasRole(ctx, "manager");

  return (
    <div className="space-y-6">
      <PageHeader title="บัญชีดำ" description="เบอร์โทร IP UID อีเมล หรืออุปกรณ์ที่ห้ามสั่งเติม — ระบบปฏิเสธรายการใหม่ที่ตรงกันอัตโนมัติ" />
      <FilterTabs
        active="blacklist"
        tabs={[
          { key: "suppliers", label: "Supplier", href: `/t/${slug}/topup/suppliers` },
          { key: "blacklist", label: "บัญชีดำ", count: list.total, href: base },
        ]}
      />

      {canWrite && <BlacklistForm key={`${kind ?? "phone"}:${prefill}`} slug={slug} initialKind={kind ?? "phone"} initialValue={prefill} />}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs active={listKind ?? "all"} tabs={[{ key: "all", label: "ทั้งหมด", href: `${base}${qs({ q })}` }, ...KINDS.map((k) => ({ key: k, label: BLACKLIST_KIND_LABEL[k]!, href: `${base}${qs({ q, kind: k })}` }))]} />
        <form className="flex gap-2" action={base}>
          {listKind && <input type="hidden" name="kind" value={listKind} />}
          <div className="relative flex-1 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="ค้นหาค่า หรือเหตุผล…" className="pl-9" aria-label="ค้นหาบัญชีดำ" />
          </div>
          <Button type="submit" variant="secondary">
            ค้นหา
          </Button>
          {q && (
            <Button asChild variant="ghost" size="icon" aria-label="ล้างคำค้น">
              <Link href={`${base}${qs({ kind: listKind })}`}>
                <X aria-hidden />
              </Link>
            </Button>
          )}
        </form>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState icon={ShieldBan} title={q || listKind ? "ไม่พบรายการตามเงื่อนไข" : "บัญชีดำว่าง"} description={q || listKind ? "ลองเปลี่ยนคำค้นหรือประเภท" : "เพิ่มเบอร์ / UID ที่เคยโกงหรือ chargeback เพื่อป้องกันการสั่งซ้ำ"} />
      ) : (
        <div className="card min-w-0 py-0">
          <ul className="divide-y" data-testid="blacklist-list">
            {list.rows.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3 sm:px-5" data-blacklist-value={b.value}>
                <Badge variant="outline" className="w-24 shrink-0 justify-center">
                  {BLACKLIST_KIND_LABEL[b.kind] ?? b.kind}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-sm font-semibold">{b.value}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.reason || "ไม่ระบุเหตุผล"} · เพิ่ม {fmtDate(b.createdAt, { withTime: true })}
                  </p>
                </div>
                {canWrite && <RemoveBlacklistButton slug={slug} id={b.id} value={b.value} />}
              </li>
            ))}
          </ul>
          <Pagination page={list.page} pages={list.pages} total={list.total} baseHref={base} params={{ q, kind: listKind }} label="รายการ" />
        </div>
      )}
    </div>
  );
}
