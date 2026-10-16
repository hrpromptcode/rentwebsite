"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List, Search } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { cn } from "@rentweb/ui/lib/utils";
import { NativeSelect } from "@rentweb/module-booking/admin/ui";
import { CALENDAR_STATUS_FILTERS } from "./calendar-style";

export interface ToolbarProps {
  base: string;
  date: string;
  today: string;
  view: "day" | "week";
  staff: string;
  status: string;
  q: string;
  prevDate: string;
  nextDate: string;
  staffOptions: Array<{ id: string; name: string }>;
}

export function CalendarToolbar(p: ToolbarProps) {
  const router = useRouter();
  const [q, setQ] = React.useState(p.q);
  const href = (over: Partial<Record<"date" | "view" | "staff" | "status" | "q", string>>) => {
    const sp = new URLSearchParams();
    const merged = { date: p.date, view: p.view, staff: p.staff, status: p.status, q: p.q, ...over };
    if (merged.date && merged.date !== p.today) sp.set("date", merged.date);
    if (merged.view === "week") sp.set("view", "week");
    if (merged.staff) sp.set("staff", merged.staff);
    if (merged.status) sp.set("status", merged.status);
    if (merged.q) sp.set("q", merged.q);
    const s = sp.toString();
    return s ? `${p.base}?${s}` : p.base;
  };

  return (
    <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label={p.view === "week" ? "สัปดาห์ก่อนหน้า" : "วันก่อนหน้า"}>
          <Link href={href({ date: p.prevDate })}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        <Button asChild variant={p.date === p.today ? "secondary" : "outline"}>
          <Link href={href({ date: p.today })}>วันนี้</Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label={p.view === "week" ? "สัปดาห์ถัดไป" : "วันถัดไป"}>
          <Link href={href({ date: p.nextDate })}>
            <ChevronRight aria-hidden />
          </Link>
        </Button>
        <Input type="date" value={p.date} onChange={(e) => e.target.value && router.push(href({ date: e.target.value }))} className="h-10 w-0 min-w-0 flex-1 px-2.5 text-sm lg:w-40 lg:flex-none lg:px-3.5" aria-label="เลือกวันที่" />
      </div>

      <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="มุมมอง">
        {(
          [
            { key: "day", label: "รายวัน", icon: CalendarDays },
            { key: "week", label: "รายสัปดาห์", icon: List },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={href({ view: t.key })}
            role="tab"
            aria-selected={p.view === t.key}
            className={cn("flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors", p.view === t.key ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            <t.icon className="size-4" aria-hidden /> {t.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:ml-auto lg:flex lg:flex-wrap lg:items-center lg:justify-end">
        <NativeSelect value={p.staff} onChange={(e) => router.push(href({ staff: e.target.value }))} aria-label="กรองตามพนักงาน" className="lg:w-44">
          <option value="">พนักงานทั้งหมด</option>
          {p.staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="none">ไม่ระบุพนักงาน</option>
        </NativeSelect>
        <NativeSelect value={p.status} onChange={(e) => router.push(href({ status: e.target.value }))} aria-label="กรองตามสถานะ" className="lg:w-52">
          {CALENDAR_STATUS_FILTERS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <form
          className="relative col-span-2 lg:w-56"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(href({ q: q.trim() }));
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ เบอร์ เลขที่จอง…" className="h-10 pl-9" aria-label="ค้นหาการจอง" enterKeyHint="search" />
        </form>
      </div>
    </div>
  );
}
