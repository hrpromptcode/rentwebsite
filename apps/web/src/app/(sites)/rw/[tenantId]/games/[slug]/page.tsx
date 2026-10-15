import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Reveal } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { enabledMethods } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { bestTierPrice, getGameBySlug, getWallet, priceFor, topupConfig } from "@rentweb/module-topup/services";
import { TopupForm, type TopupFormPackage } from "@rentweb/module-topup/components";
import { CATEGORY_LABEL } from "@rentweb/module-topup/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { createTopupOrderAction } from "./actions";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug } = await params;
  const detail = await tenantTx(tenantId, (tx) => getGameBySlug(tx, tenantId, slug));
  if (!detail) return {};
  return { title: `เติม ${detail.game.name}`, description: detail.game.description ?? undefined };
}

export default async function GamePage({ params, searchParams }: { params: Params; searchParams: Promise<{ pkg?: string }> }) {
  const { tenantId, slug } = await params;
  const { pkg } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  const [detail, wallet] = await tenantTx(tenantId, async (tx) => Promise.all([getGameBySlug(tx, tenantId, slug), customer ? getWallet(tx, tenantId, customer.id) : null]));
  if (!detail) notFound();
  const { game, packages } = detail;
  const cfg = topupConfig(runtime.config.moduleConfig.topup);
  const settings = runtime.config.settings;

  const enabled = enabledMethods(settings);
  const walletEnabled = cfg.walletEnabled && enabled.includes("wallet");
  const methods: PaymentMethodOption[] = [];
  if (walletEnabled) {
    methods.push(
      customer
        ? { value: "wallet", label: "กระเป๋าเงินในเว็บ", description: `คงเหลือ ${thb(wallet?.balance ?? 0)} · ตัดทันที ไม่ต้องแนบสลิป`, disabled: false }
        : { value: "wallet", label: "กระเป๋าเงินในเว็บ", description: "เข้าสู่ระบบเพื่อใช้กระเป๋า", disabled: true },
    );
  }
  if (enabled.includes("promptpay_qr")) methods.push({ value: "promptpay_qr", label: "PromptPay QR", description: "สแกนจ่าย แนบสลิป ระบบตรวจอัตโนมัติ" });
  if (enabled.includes("slip")) methods.push({ value: "slip", label: "โอนเงินผ่านธนาคาร", description: "โอนแล้วแนบสลิปยืนยัน" });
  // signed-in customers default to the wallet when it can cover the cheapest package
  if (customer && walletEnabled && methods[0]?.value === "wallet" && (wallet?.balance ?? 0) <= 0) methods.push(methods.shift()!);

  const formPackages: TopupFormPackage[] = packages.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    yourPrice: priceFor(p, customer?.tier),
    badge: p.badge,
    fulfillment: p.fulfillment,
    estimatedMinutes: p.estimatedMinutes,
    available: p.available,
    tierHint: bestTierPrice(p),
  }));
  const autoCount = packages.filter((p) => p.fulfillment !== "manual").length;
  const action = createTopupOrderAction.bind(null, tenantId, slug);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      {/* banner */}
      <section className="relative isolate overflow-hidden">
        {game.banner && (
          <div className="absolute inset-0 -z-10" aria-hidden>
            <Img src={game.banner} alt="" className="size-full scale-110 object-cover opacity-30 blur-2xl" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
          </div>
        )}
        <div className="container-x pt-2 pb-8 md:pb-10">
          <Link href="/games" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> เกมทั้งหมด
          </Link>
          <Reveal className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="relative shrink-0">
              <div className="absolute -inset-3 -z-10 rounded-[var(--radius-2xl)] bg-glow/40 blur-2xl" aria-hidden />
              <Img src={game.image ?? ""} alt={game.name} className="size-24 rounded-[var(--radius-xl)] object-cover shadow-xl md:size-32" priority />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="soft">{CATEGORY_LABEL[game.category] ?? game.category}</Badge>
                {game.publisher && <span className="text-sm text-muted-foreground">{game.publisher}</span>}
              </div>
              <h1 className="heading-display mt-2 text-4xl font-semibold md:text-6xl">{game.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground md:text-sm">
                {autoCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5">
                    <Zap className="size-3.5 text-primary" /> {autoCount} แพ็กเกจเติมอัตโนมัติ
                  </span>
                )}
                {autoCount < packages.length && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5">
                    <Clock className="size-3.5 text-amber-500" /> เติมมือ 5–30 นาที
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-500" /> ไม่ต้องให้รหัสผ่าน
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container-x pb-16 md:pb-24">
        {packages.length === 0 ? (
          <div className="card p-10 text-center text-muted-foreground">ยังไม่มีแพ็กเกจสำหรับเกมนี้</div>
        ) : (
          <TopupForm
            game={{ name: game.name, slug: game.slug, fields: game.fields ?? [], instructions: game.instructions }}
            packages={formPackages}
            methods={methods}
            loggedIn={!!customer}
            walletBalance={customer ? (wallet?.balance ?? 0) : null}
            tier={customer?.tier ?? null}
            defaultContact={customer?.phone ?? customer?.email ?? ""}
            loginHref={`/account/login?next=${encodeURIComponent(`/games/${slug}`)}`}
            walletHref="/wallet"
            action={action}
            initialPackageId={pkg ?? null}
          />
        )}
      </section>
    </PageBody>
  );
}
