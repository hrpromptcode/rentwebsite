import * as React from "react";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import { StaySearchForm } from "../components/stay-search-form";
import { listUnitTypes } from "../services/catalog";
import { rentalConfig, type RentalConfig } from "../services/config";
import { addDays, bkkDateString, isValidYmd } from "../services/time";

/* Server helpers for the stay-search widgets. Kept apart from the hero section so operational pages (/stay) never pull
   the hero's 3D wrapper into their client graph. */

/** today / last bookable check-in / default check-out for the search widgets (civil Bangkok dates). */
export function searchDates(config: Pick<RentalConfig, "maxAdvanceDays">, now = new Date()): { today: string; maxDate: string } {
  const today = bkkDateString(now);
  return { today, maxDate: addDays(today, config.maxAdvanceDays) };
}

export interface StaySearchExtra {
  /** preselected search (from /stay?from&to&guests) */
  initial?: { from?: string | null; to?: string | null; guests?: number | null };
  /** render the search card only (used by the /stay page header) */
  bare?: boolean;
}

/** Search-form props for a tenant (max guests over the active room types, the sellable window, the preselected search). */
export async function staySearchFormProps(ctx: StorefrontCtx, initial?: StaySearchExtra["initial"]) {
  const tenantId = ctx.tenant.id;
  const config = rentalConfig(ctx.tenant.moduleConfig);
  const types = await withTenant(getDb(), tenantId, (tx) => listUnitTypes(tx, tenantId, { activeOnly: true }));
  const maxGuests = Math.max(1, ...types.map((t) => t.maxGuests));
  const { today, maxDate } = searchDates(config);
  const from = initial?.from && isValidYmd(initial.from) && initial.from >= today ? initial.from : null;
  const to = from && initial?.to && isValidYmd(initial.to) && initial.to > from ? initial.to : null;
  const guests = initial?.guests && initial.guests > 0 ? Math.min(initial.guests, maxGuests) : 2;
  return { today, maxDate, maxGuests, initial: { from, to, guests } };
}


/** The glass search bar alone (the /stay page header): calendar popover opens downwards. */
export async function StaySearchBar({ ctx, initial }: { ctx: StorefrontCtx; initial?: StaySearchExtra["initial"] }) {
  const fp = await staySearchFormProps(ctx, initial);
  return <StaySearchForm {...fp} panel="down" />;
}
