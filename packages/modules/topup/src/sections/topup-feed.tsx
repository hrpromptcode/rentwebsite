import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { topupFeed } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { Reveal } from "@rentweb/ui/motion";
import { recentFeed } from "../services/orders";
import { TopupFeedClient, type FeedRow } from "../components/topup-feed-client";

type Props = z.output<typeof topupFeed.schema>;

/** "topup-feed" section: live list of recent (masked) top-ups, polled from /api/topup/feed. */
export async function TopupFeedSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const items = await withTenant(getDb(), ctx.tenant.id, (tx) => recentFeed(tx, ctx.tenant.id, p.limit));
  const rows: FeedRow[] = items.map((i) => ({ ...i, at: i.at.toISOString() }));
  return (
    <Section id={id} className="!py-10 md:!py-14">
      <div className="container-x">
        <SectionHeading heading={p.heading} align="left" className="mb-6 md:mb-8" />
        <Reveal>
          <TopupFeedClient initial={rows} limit={p.limit} />
        </Reveal>
      </div>
    </Section>
  );
}
