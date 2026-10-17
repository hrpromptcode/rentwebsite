import * as React from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight, CalendarDays } from "lucide-react";
import { getDb, withTenant } from "@rentweb/db";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { weeklySchedule } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import { listTimetable } from "../services/classes";
import { bookingConfig } from "../services/config";
import { addDays, bkkDateString, parseYmd, ymdToString } from "../services/time";
import { WeekTimetable } from "../components/week-timetable";
import { L } from "../labels";

type Props = z.output<typeof weeklySchedule.schema>;

/** Home-page timetable: the next `days` days starting today, grouped per day, seats left per session. */
export async function WeeklyScheduleSection({ ctx, props: p, id }: { ctx: StorefrontCtx; props: Props; id: string; index: number }) {
  const config = bookingConfig(ctx.tenant.moduleConfig);
  const now = new Date();
  const from = bkkDateString(now);
  const sessions = await withTenant(getDb(), ctx.tenant.id, (tx) => listTimetable(tx, ctx.tenant.id, { from, days: p.days, config, now }));
  const days = Array.from({ length: p.days }, (_, i) => ymdToString(addDays(parseYmd(from)!, i)));
  return (
    <Section id={id} tone="surface">
      <div className="container-x">
        <SectionHeading eyebrow={p.eyebrow} heading={p.heading} subheading={p.subheading} />
        {sessions.length === 0 ? (
          <Reveal className="card mx-auto flex max-w-xl flex-col items-center gap-3 p-10 text-center">
            <CalendarDays className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{L.noSessionsThisWeek}</p>
            <Button asChild variant="outline" className="h-11">
              <Link href="/schedule">{L.schedule}</Link>
            </Button>
          </Reveal>
        ) : (
          <WeekTimetable days={days} sessions={sessions} today={from} showPrice={p.showPrice} compact />
        )}
        <Reveal className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/schedule">
              {L.weeklyTimetable} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Reveal>
      </div>
    </Section>
  );
}
