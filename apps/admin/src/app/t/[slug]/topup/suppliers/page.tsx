import type { Metadata } from "next";
import { Boxes, Plug } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { listAdminSuppliers } from "@rentweb/module-topup/admin";
import { PROVIDER_LABEL } from "@rentweb/module-topup/admin/labels";
import { FilterTabs } from "@rentweb/module-topup/admin/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { fmtDate, fmtNumber, thb } from "@/lib/format";
import { getTenantCtx, hasRole, tenantTx } from "@/lib/tenant";
import { DeleteSupplierButton, SupplierDialogButton } from "./supplier-dialog";

export const metadata: Metadata = { title: "Supplier" };

export default async function TopupSuppliersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const rows = await tenantTx(ctx.tenant.id, (tx) => listAdminSuppliers(tx, ctx.tenant.id));
  const canWrite = hasRole(ctx, "manager");

  return (
    <div className="space-y-6">
      <PageHeader title="Supplier / สต็อก" description="ผู้ให้บริการเติมเกมสำหรับแพ็กเกจแบบอัตโนมัติ · สต็อกโค้ดจัดการได้ในหน้าเกมแต่ละเกม" actions={canWrite && <SupplierDialogButton slug={slug} />} />
      <FilterTabs
        active="suppliers"
        tabs={[
          { key: "suppliers", label: "Supplier", count: rows.length, href: `/t/${slug}/topup/suppliers` },
          { key: "blacklist", label: "บัญชีดำ", href: `/t/${slug}/topup/blacklist` },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon={Plug} title="ยังไม่มี supplier" description="ถ้ายังไม่มี API ของผู้ให้บริการ แพ็กเกจแบบอัตโนมัติจะใช้ตัวจำลอง หรือตั้งเป็นเติมมือแทน" action={canWrite ? <SupplierDialogButton slug={slug} /> : undefined} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="supplier-list">
          {rows.map((s) => {
            const config = JSON.stringify(s.config ?? {}, null, 2);
            const keys = Object.keys(s.config ?? {});
            return (
              <li key={s.id} className="card flex min-w-0 flex-col gap-3 p-4 sm:p-5" data-supplier={s.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Boxes className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{PROVIDER_LABEL[s.provider] ?? s.provider}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {s.active ? <Badge variant="success">ใช้งาน</Badge> : <Badge variant="muted">ปิดอยู่</Badge>}
                    {canWrite && (
                      <>
                        <SupplierDialogButton slug={slug} supplier={{ id: s.id, name: s.name, provider: s.provider === "manual" ? "manual" : "generic_http", config, active: s.active }} />
                        <DeleteSupplierButton slug={slug} id={s.id} name={s.name} packageCount={s.packageCount} />
                      </>
                    )}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">แพ็กเกจที่ใช้</dt>
                    <dd className="font-semibold tabular-nums">{fmtNumber(s.packageCount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">ยอดเงินคงเหลือที่ supplier</dt>
                    <dd className="font-semibold tabular-nums">{s.balance ? thb(s.balance) : "—"}</dd>
                  </div>
                </dl>
                <p className="truncate text-xs text-muted-foreground" title={config}>
                  config: {keys.length ? keys.join(", ") : "ว่าง"} · แก้ไข {fmtDate(s.updatedAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
