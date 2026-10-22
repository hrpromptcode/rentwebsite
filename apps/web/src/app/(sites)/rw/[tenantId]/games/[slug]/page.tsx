import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Clock, ShieldCheck, Zap } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { ParallaxMedia, Reveal } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { Img, RevealHeading } from "@rentweb/storefront";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { enabledMethods } from "@rentweb/core/payments";
import { thb } from "@rentweb/core/money";
import { bestTierPrice, getGameBySlug, getWallet, priceFor, safeFieldPattern, topupConfig } from "@rentweb/module-topup/services";
import { Brackets, HoloCard, TopupForm, TopupStyles, type TopupFormPackage } from "@rentweb/module-topup/components";
import { CATEGORY_LABEL } from "@rentweb/module-topup/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { createTopupOrderAction } from "./actions";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const detail = await tenantTx(tenantId, (tx) => getGameBySlug(tx, tenantId, slug));
  if (!detail) return {};
  return { title: `เติม ${detail.game.name}`, description: detail.game.description ?? undefined };
}

export default async function GamePage({ params, searchParams }: { params: Params; searchParams: Promise<{ pkg?: string }> }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
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
  const walletFrozen = !!wallet?.frozen;
  if (walletEnabled) {
    methods.push(
      !customer
        ? { value: "wallet", label: "กระเป๋าเงินในเว็บ", description: "เข้าสู่ระบบเพื่อใช้กระเป๋า", disabled: true }
        : walletFrozen
          ? { value: "wallet", label: "กระเป๋าเงินในเว็บ (ใช้ไม่ได้)", description: "กระเป๋าเงินถูกระงับชั่วคราว กรุณาติดต่อแอดมิน · เลือกชำระด้วย PromptPay หรือโอนเงินแทน", disabled: true }
          : { value: "wallet", label: "กระเป๋าเงินในเว็บ", description: `คงเหลือ ${thb(wallet?.balance ?? 0)} · ตัดทันที ไม่ต้องแนบสลิป`, disabled: false },
    );
  }
  if (enabled.includes("promptpay_qr")) methods.push({ value: "promptpay_qr", label: "PromptPay QR", description: "สแกนจ่าย แนบสลิป ระบบตรวจอัตโนมัติ" });
  if (enabled.includes("slip")) methods.push({ value: "slip", label: "โอนเงินผ่านธนาคาร", description: "โอนแล้วแนบสลิปยืนยัน" });
  // signed-in customers default to the wallet only when it has a balance and is not frozen (the form preselects the first enabled method)
  if (customer && walletEnabled && methods[0]?.value === "wallet" && (walletFrozen || (wallet?.balance ?? 0) <= 0)) methods.push(methods.shift()!);

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
  // RV-01: only patterns the server itself accepts reach the input (an unsafe / invalid one is ignored on both sides)
  const formFields = (game.fields ?? []).map((f) => ({ ...f, pattern: safeFieldPattern(f.pattern) ? f.pattern : undefined }));
  const autoCount = packages.filter((p) => p.fulfillment !== "manual").length;
  const action = createTopupOrderAction.bind(null, tenantId, slug);

  const overlay = runtime.theme.layout.header === "floating" || (runtime.theme.layout.headerTransparent && runtime.theme.layout.headerSticky);
  const fromPrice = packages.length ? Math.min(...packages.map((p) => priceFor(p, customer?.tier))) : null;
  const hudTag = { mobile: "MOBILE", app: "APP", pc: "PC", console: "CONSOLE", voucher: "CODE" }[game.category] ?? game.category.toUpperCase();

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <TopupStyles />
      {/* banner: the cover blurred + parallax behind a synthwave floor, sharp holo cover tile in front (no 3D, operational-light) */}
      <section className={cn("relative isolate overflow-clip", overlay && "-mt-20 pt-20 md:-mt-28 md:pt-28")}>
        <div className="absolute inset-0 -z-10" aria-hidden>
          {game.banner && (
            <ParallaxMedia speed={-0.12} scale={1.15} className="absolute inset-0" innerClassName="size-full">
              <Img src={game.banner} alt="" className="size-full scale-110 object-cover opacity-60 blur-2xl saturate-150" />
            </ParallaxMedia>
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--background)_30%,transparent),color-mix(in_oklab,var(--background)_78%,transparent)_60%,var(--background))]" />
          <div className="tp-floor" />
        </div>
        <div className="container-x pt-2 pb-8 md:pb-14">
          <Link href="/games" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> เกมทั้งหมด
          </Link>
          <div className="mt-2 flex flex-row items-end gap-5 md:mt-4 md:gap-10">
            <Reveal direction="scale" className="relative shrink-0">
              <div className="absolute -inset-4 -z-10 rounded-[var(--radius-2xl)] bg-glow/40 blur-2xl" aria-hidden />
              <HoloCard className="w-24 rounded-[var(--radius-xl)] sm:w-32 md:w-44 lg:w-52" max={9}>
                <div className="tp-cover aspect-[3/4] overflow-hidden rounded-[inherit] border border-white/15 shadow-[0_30px_70px_-25px_rgba(0,0,0,.8),0_0_40px_-12px_var(--glow)]">
                  <Img src={game.image ?? ""} alt={game.name} className="absolute inset-0 size-full object-cover" priority />
                  <span aria-hidden className="tp-foil" />
                </div>
                <Brackets size={12} className="-m-2" />
              </HoloCard>
            </Reveal>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Badge variant="soft">{CATEGORY_LABEL[game.category] ?? game.category}</Badge>
                {game.publisher && (
                  <span className="tp-hud text-muted-foreground" data-script="latin">
                    {game.publisher} · {hudTag}
                  </span>
                )}
              </div>
              <RevealHeading as="h1" text={game.name} trigger="mount" mode="words" className="mt-2 font-heading text-step-4 leading-[1.05] font-semibold text-balance md:text-step-5" />
              <Reveal delay={0.15} className="mt-4 hidden flex-wrap gap-2 text-xs text-muted-foreground sm:flex md:text-sm">
                {autoCount > 0 && (
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 backdrop-blur">
                    <Zap className="size-3.5 text-primary" /> {autoCount} แพ็กเกจเติมอัตโนมัติ
                  </span>
                )}
                {autoCount < packages.length && (
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 backdrop-blur">
                    <Clock className="size-3.5 text-amber-500" /> เติมมือ 5–30 นาที
                  </span>
                )}
                <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-3 backdrop-blur">
                  <ShieldCheck className="size-3.5 text-emerald-500" /> ไม่ต้องให้รหัสผ่าน
                </span>
              </Reveal>
            </div>
            {fromPrice !== null && (
              <div className="hidden shrink-0 pb-2 text-right lg:block">
                <p className="tp-hud text-muted-foreground" data-script="latin">
                  {String(packages.length).padStart(2, "0")} packages · from
                </p>
                <p className="tp-num mt-1 text-step-4 leading-none font-semibold text-primary text-glow">{thb(fromPrice)}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="container-x pb-16 md:pb-24">
        {packages.length === 0 ? (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-border/80 bg-card/50 p-10 text-center text-muted-foreground">ยังไม่มีแพ็กเกจสำหรับเกมนี้</div>
        ) : (
          <TopupForm
            game={{ name: game.name, slug: game.slug, fields: formFields, instructions: game.instructions, image: game.image }}
            packages={formPackages}
            methods={methods}
            loggedIn={!!customer}
            otpRequired={cfg.otpRequiredFirstOrder}
            walletBalance={customer && !walletFrozen ? (wallet?.balance ?? 0) : null}
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
