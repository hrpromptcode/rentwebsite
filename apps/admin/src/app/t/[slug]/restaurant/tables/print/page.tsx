import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, QrCode } from "lucide-react";
import { promptpayQrDataUrl } from "@rentweb/core/payments";
import { Button } from "@rentweb/ui/components/button";
import { listTablesAdmin } from "@rentweb/module-restaurant/admin";
import { EmptyState } from "@/components/ui/empty-state";
import { getTenantCtx, tenantTx } from "@/lib/tenant";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "พิมพ์ QR โต๊ะ" };

const PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  aside, body > div > div > header, .no-print { display: none !important; }
  main { padding: 0 !important; }
  main > div { max-width: none !important; }
  html, body { background: #fff !important; }
  .qr-grid { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 6mm !important; }
  .qr-card { break-inside: avoid; page-break-inside: avoid; height: 62mm; border: 1px dashed #bbb !important; box-shadow: none !important; background: #fff !important; color: #111 !important; }
}
`;

export default async function PrintQrPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ zone?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantCtx(slug);
  if (!ctx.modules.includes("restaurant")) notFound();
  const all = (await tenantTx(ctx.tenant.id, (tx) => listTablesAdmin(tx, ctx.tenant.id))).filter((t) => t.active);
  const zones = [...new Set(all.map((t) => t.zone).filter((z): z is string => !!z))];
  const tables = sp.zone ? all.filter((t) => t.zone === sp.zone) : all;
  const host = ctx.hostname;
  const cards = await Promise.all(
    tables.map(async (t) => {
      const url = `${ctx.storefrontUrl}/t/${t.qrToken}`;
      return { ...t, url, short: `${host}/t/${t.qrToken}`, qr: await promptpayQrDataUrl(url) };
    }),
  );

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="กลับ">
            <Link href={`/t/${slug}/restaurant/tables`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">พิมพ์ QR โต๊ะ</h1>
            <p className="text-sm text-muted-foreground">
              {cards.length} ใบ · กระดาษ A4 ใบละ 8 โต๊ะ · ตัดตามเส้นประแล้วใส่กรอบตั้งโต๊ะ
            </p>
            {zones.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button asChild size="sm" variant={!sp.zone ? "default" : "outline"}>
                  <Link href={`/t/${slug}/restaurant/tables/print`}>ทุกโซน</Link>
                </Button>
                {zones.map((z) => (
                  <Button key={z} asChild size="sm" variant={sp.zone === z ? "default" : "outline"}>
                    <Link href={`/t/${slug}/restaurant/tables/print?zone=${encodeURIComponent(z)}`}>{z}</Link>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
        <PrintButton />
      </div>

      {cards.length === 0 ? (
        <EmptyState icon={QrCode} title="ไม่มีโต๊ะที่เปิดใช้งาน" description="เพิ่มโต๊ะก่อน แล้วกลับมาพิมพ์ QR" />
      ) : (
        <ul className="qr-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="ป้าย QR">
          {cards.map((c) => (
            <li key={c.id} className="qr-card flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.qr} alt={`QR โต๊ะ ${c.name}`} className="size-36 shrink-0 rounded-lg bg-white p-1 [image-rendering:pixelated]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">{ctx.tenant.name}</p>
                <p className="mt-1 font-heading text-4xl font-bold leading-none tracking-tight">โต๊ะ {c.name}</p>
                {c.zone && <p className="mt-1 text-sm text-muted-foreground">โซน{c.zone}</p>}
                <p className="mt-3 text-sm font-medium">สแกนเพื่อดูเมนูและสั่งอาหาร</p>
                <p className="mt-0.5 break-all text-[10px] leading-tight text-muted-foreground">{c.short}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
