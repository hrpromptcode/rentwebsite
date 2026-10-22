import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { gameGrid } from "@rentweb/storefront/definitions";
import { Section, SectionHeading, hasAccentFont, pad2 } from "@rentweb/storefront";
import { listGames } from "../services/catalog";
import { GameGridClient } from "../components/game-grid-client";

type Props = z.output<typeof gameGrid.schema>;

/**
 * "game-grid" section (GameHub §5.2 #3): HUD heading + searchable, tabbed grid of holographic game tiles (sliding
 * category pill, Flip reflow on filter, cover parallax + foil on hover). Featured games first (service order).
 */
export async function GameGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const games = await withTenant(getDb(), ctx.tenant.id, (tx) => listGames(tx, ctx.tenant.id, { limit: p.limit }));
  return (
    <Section id={id} type="game-grid" className="overflow-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[60%] bg-[radial-gradient(50%_60%_at_80%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)]" />
      <div className="container-x relative">
        <SectionHeading
          eyebrow="Select game"
          index={games.length ? pad2(games.length) : undefined}
          heading={p.heading}
          subheading={p.subheading}
          align="left"
          layout="split"
          accent={hasAccentFont(ctx)}
          className="mb-10 md:mb-14"
        />
        <GameGridClient games={games} showSearch={p.showSearch} variant={p.variant} />
      </div>
    </Section>
  );
}
