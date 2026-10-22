import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { CalendarDays } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { weeklySchedule } from "@rentweb/storefront/definitions";
import { CtaButton, Rise, Section, SectionHeading } from "@rentweb/storefront";
import { listTimetable } from "../services/classes";
import { bookingConfig } from "../services/config";
import { addDays, bkkDateString, parseYmd, ymdToString } from "../services/time";
import { WeekTimetable } from "../components/week-timetable";
import { BookingStyles } from "../components/hi/styles";
import { L } from "../labels";

type Props = z.output<typeof weeklySchedule.schema>;

/** Home-page timetable (operational-ish: refined, motion only on day switch): the next `days` days, seats left per session. */
export async function WeeklyScheduleSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const config = bookingConfig(ctx.tenant.moduleConfig);
  const now = new Date();
  const from = bkkDateString(now);
  const sessions = await withTenant(getDb(), ctx.tenant.id, (tx) => listTimetable(tx, ctx.tenant.id, { from, days: p.days, config, now }));
  const days = Array.from({ length: p.days }, (_, i) => ymdToString(addDays(parseYmd(from)!, i)));
  const open = sessions.filter((s) => s.state === "open").length;
  return (
    <Section id={id} type="weekly-schedule" tone="surface">
      <BookingStyles />
      <div className="container-x">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6 md:mb-14">
          <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} align="left" className="mb-0 md:mb-0" />
          {sessions.length > 0 && (
            <p className="flex items-baseline gap-3 text-sm text-muted-foreground">
              <span className="bk-count text-step-4 text-primary">{open}</span> รอบที่ยังเปิดรับ
            </p>
          )}
        </div>
        {sessions.length === 0 ? (
          <Rise className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-[calc(var(--radius,.75rem)*1.6)] border border-dashed p-10 text-center">
            <CalendarDays className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{L.noSessionsThisWeek}</p>
            <Link href="/schedule" className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium hover:border-primary">
              {L.schedule}
            </Link>
          </Rise>
        ) : (
          <WeekTimetable days={days} sessions={sessions} today={from} showPrice={p.showPrice} compact />
        )}
        <Rise className="mt-12 flex flex-wrap justify-center gap-3">
          <CtaButton href="/schedule" label={L.weeklyTimetable} size="lg" />
        </Rise>
      </div>
    </Section>
  );
}
