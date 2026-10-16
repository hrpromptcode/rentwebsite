import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Lock } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { paymentSettings, resolvePromptpayId } from "@rentweb/core/payments";
import { getActiveMenu, getTableByQr, openOrGetSession, restaurantConfigOf } from "@rentweb/module-restaurant/services";
import { loadSessionDto } from "@rentweb/module-restaurant/dto";
import { MenuBrowser, TablePanel } from "@rentweb/module-restaurant/components";
import { L } from "@rentweb/module-restaurant/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { submitDineInOrder } from "./actions";

type Params = Promise<{ tenantId: string; qrToken: string }>;

export const metadata: Metadata = { title: "สั่งอาหารที่โต๊ะ", robots: { index: false, follow: false } };

/** /t/[qrToken] – scanned from the table QR: opens (or joins) the table session, shows the menu + round history + bill. */
export default async function TablePage({ params }: { params: Params }) {
  const { tenantId, qrToken } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("restaurant")) notFound();
  const cfg = restaurantConfigOf(runtime.config);

  const data = await tenantTx(tenantId, async (tx) => {
    const table = await getTableByQr(tx, tenantId, qrToken);
    if (!table) return null;
    // a session left open by earlier guests (idle / too old) is retired, the next guests start fresh (SBR-006)
    const { session } = await openOrGetSession(tx, tenantId, table.id, { idleMinutes: cfg.tableSessionIdleMinutes, maxHours: cfg.tableSessionMaxHours });
    const dto = await loadSessionDto(tx, tenantId, session.id);
    const menu = await getActiveMenu(tx, tenantId);
    return { session, dto, menu };
  });
  if (!data || !data.dto) notFound();

  const settings = runtime.config.settings;
  const pay = paymentSettings(settings);
  const promptpayId = resolvePromptpayId(settings);
  const promptpayEnabled = (pay.enabled?.promptpay ?? true) && !!promptpayId;
  const submit = submitDineInOrder.bind(null, tenantId, data.session.token);
  const canOrder = cfg.dineIn && !!data.menu && data.menu.categories.length > 0;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <TablePanel initial={data.dto} promptpayEnabled={promptpayEnabled} promptpayName={pay.promptpayName} promptpayId={promptpayId ?? undefined} />
      {canOrder ? (
        <MenuBrowser menu={data.menu!} mode={{ kind: "dine_in", sessionToken: data.session.token, submit }} serviceChargePercent={cfg.serviceChargePercent} />
      ) : (
        <section className="container-x py-10">
          <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
            <Lock className="size-8 text-muted-foreground" />
            <p className="font-medium">ขณะนี้ยังไม่เปิดรับออเดอร์ผ่านมือถือ</p>
            <p className="text-sm text-muted-foreground">กรุณาสั่งกับพนักงานที่โต๊ะ หรือดูเมนูได้ที่หน้าเมนู</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="lg">
                <Link href="/menu">{L.menu}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/reserve">
                  <CalendarCheck className="size-4" /> {L.reserve}
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </PageBody>
  );
}
