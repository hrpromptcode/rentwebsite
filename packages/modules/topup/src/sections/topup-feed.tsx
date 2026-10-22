import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { topupFeed } from "@rentweb/storefront/definitions";
import { RevealHeading, Rise, Section, hasAccentFont, pad2 } from "@rentweb/storefront";
import { recentFeed } from "../services/orders";
import { LiveLabel, TopupFeedClient, type FeedRow } from "../components/topup-feed-client";
import { Brackets, TopupStyles } from "../components/topup-styles";

type Props = z.output<typeof topupFeed.schema>;

/**
 * "topup-feed" section (GameHub §5.2 #4): an esports HUD kill-feed of recent (masked) top-ups, polled from
 * /api/topup/feed. A shop with no paid orders yet renders nothing (never an empty "ยังไม่มีรายการ" box on the home page).
 */
export async function TopupFeedSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const items = await withTenant(getDb(), ctx.tenant.id, (tx) => recentFeed(tx, ctx.tenant.id, p.limit));
  if (items.length === 0) return null;
  const rows: FeedRow[] = items.map((i) => ({ ...i, at: i.at.toISOString() }));
  const games = new Set(items.map((i) => i.gameName)).size;
  return (
    <Section id={id} type="topup-feed" className="!py-12 md:!py-20">
      <TopupStyles />
      <div className="container-x">
        <div className="tp-gridbg relative overflow-hidden rounded-[var(--radius-2xl)] border border-border/70 bg-card/40">
          <div aria-hidden className="tp-sweep" />
          <Brackets size={16} />
          <div className="relative grid lg:grid-cols-12">
            <div className="flex flex-col justify-between gap-8 border-b border-border/60 p-6 md:p-8 lg:col-span-4 lg:border-r lg:border-b-0">
              <div>
                <LiveLabel />
                <RevealHeading as="h2" text={p.heading} accent={hasAccentFont(ctx)} className="mt-5 font-heading text-step-3 font-semibold text-balance" />
                <Rise delay={0.1}>
                  <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">รายการจริงจากระบบ แสดงเฉพาะ ID ผู้เล่นที่ปิดบังแล้ว</p>
                </Rise>
              </div>
              <dl className="grid grid-cols-3 gap-3 border-t border-border/60 pt-5">
                {[
                  ["ROWS", pad2(rows.length)],
                  ["GAMES", pad2(games)],
                  ["SYNC", "10s"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="tp-hud text-[10px] text-muted-foreground" data-script="latin">
                      {k}
                    </dt>
                    <dd className="tp-num mt-1 text-xl font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="lg:col-span-8">
              <TopupFeedClient initial={rows} limit={p.limit} renderedAt={new Date().toISOString()} framed={false} />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
