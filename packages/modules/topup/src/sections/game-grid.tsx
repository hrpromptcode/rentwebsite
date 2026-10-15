import * as React from "react";
import type { z } from "zod";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { gameGrid } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { listGames } from "../services/catalog";
import { GameGridClient } from "../components/game-grid-client";

type Props = z.output<typeof gameGrid.schema>;

/** "game-grid" section: searchable, tabbed grid of the tenant's games (featured first). */
export async function GameGridSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const games = await withTenant(getDb(), ctx.tenant.id, (tx) => listGames(tx, ctx.tenant.id, { limit: p.limit }));
  return (
    <Section id={id}>
      <div className="container-x">
        <SectionHeading heading={p.heading} subheading={p.subheading} />
        <GameGridClient games={games} showSearch={p.showSearch} variant={p.variant} />
      </div>
    </Section>
  );
}
