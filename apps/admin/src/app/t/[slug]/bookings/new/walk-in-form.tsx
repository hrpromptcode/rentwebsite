"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Phone, Search, Sparkles, UserPlus, UserRound, X } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import type { CustomerHit } from "@rentweb/module-booking/admin";
import { walkInSchema, fieldErrors, type WalkInInput } from "@rentweb/module-booking/admin/schemas";
import { addDays, Avatar, formatBkkTime, formatThaiYmd, parseYmd, SlotPicker, ymdToString, type SlotChip } from "@rentweb/module-booking/admin/ui";
import { Field } from "@/components/ui/form";
import { thb } from "@/lib/format";
import { adminSlotsAction, createWalkInAction, searchCustomersAction } from "../actions";

export interface WalkInService {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  capacity: number;
  requiresStaff: boolean;
  categoryName: string | null;
}
export interface WalkInStaff {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
  title: string | null;
  serviceIds: string[];
  acceptsOnlineBooking: boolean;
}

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn("grid size-6 place-items-center rounded-full text-xs", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{done ? <Check className="size-3.5" aria-hidden /> : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function WalkInForm({ slug, services, staff, today, initial }: { slug: string; services: WalkInService[]; staff: WalkInStaff[]; today: string; initial: { serviceId: string; staffId: string; date: string; time: string } }) {
  const router = useRouter();
  const [serviceId, setServiceId] = React.useState(initial.serviceId);
  const [staffId, setStaffId] = React.useState(initial.staffId);
  const [date, setDate] = React.useState(initial.date);
  const [slots, setSlots] = React.useState<SlotChip[] | null>([]);
  const [start, setStart] = React.useState<string | null>(null);
  const wantTime = React.useRef(initial.time);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<CustomerHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [partySize, setPartySize] = React.useState("1");
  const [source, setSource] = React.useState<"walk_in" | "admin">("walk_in");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const eligible = service ? staff.filter((s) => s.serviceIds.includes(service.id)) : [];
  const group = !!service && (service.capacity > 1 || !service.requiresStaff);

  // staff preset from the calendar may not do this service
  React.useEffect(() => {
    if (staffId && service && !eligible.some((s) => s.id === staffId)) setStaffId("");
  }, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    let live = true;
    setSlots(null);
    setStart(null);
    adminSlotsAction(slug, { serviceId, date, staffId: group ? null : staffId || null })
      .then((r) => {
        if (!live) return;
        if (!r.ok) {
          toast.error(r.error);
          setSlots([]);
          return;
        }
        const list = r.data ?? [];
        setSlots(list);
        if (wantTime.current) {
          const hit = list.find((s) => s.available && formatBkkTime(s.start) === wantTime.current);
          if (hit) setStart(hit.start);
          wantTime.current = "";
        }
      })
      .catch(() => live && setSlots([]));
    return () => {
      live = false;
    };
  }, [slug, serviceId, staffId, date, group]);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      searchCustomersAction(slug, term)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, slug]);

  function pickCustomer(c: CustomerHit) {
    setCustomerId(c.id);
    setName(c.name ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setQ("");
    setHits([]);
  }
  function clearCustomer() {
    setCustomerId(null);
    setName("");
    setPhone("");
    setEmail("");
  }

  const ymd = parseYmd(date);
  const quickDates = [0, 1, 2].map((n) => {
    const t = parseYmd(today)!;
    return ymdToString(addDays(t, n));
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceId) return void toast.error("กรุณาเลือกบริการ");
    if (!start) return void toast.error("กรุณาเลือกเวลา");
    const input: WalkInInput = { serviceId, staffId: group ? null : staffId || null, start, customerId, name, phone: phone || null, email: email || null, note: note || null, partySize: Number(partySize || 1), source };
    const parsed = walkInSchema.safeParse(input);
    if (!parsed.success) {
      const fe = fieldErrors(parsed.error);
      setErrors(fe);
      toast.error(Object.values(fe)[0] ?? "กรุณาตรวจสอบข้อมูล");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const r = await createWalkInAction(slug, input);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        if (/เวลา|ว่าง|จอง/.test(r.error)) {
          setSlots(null);
          const again = await adminSlotsAction(slug, { serviceId, date, staffId: group ? null : staffId || null });
          setSlots(again.ok ? (again.data ?? []) : []);
          setStart(null);
        }
        return;
      }
      toast.success(r.message ?? "สร้างการจองแล้ว");
      router.push(`/t/${slug}/bookings/${r.data!.id}`);
    } finally {
      setPending(false);
    }
  }

  const selectedSlot = slots?.find((s) => s.start === start) ?? null;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>เลือกบริการและเวลา</CardTitle>
          <CardDescription>ช่องเวลาคำนวณจากตารางงานและคิวที่มีอยู่จริง (ไม่มีขั้นต่ำการจองล่วงหน้าสำหรับแอดมิน)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Step n={1} title="บริการ" done={!!service}>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีบริการที่เปิดใช้งาน —{" "}
                <Link href={`/t/${slug}/services/new`} className="text-primary underline">
                  เพิ่มบริการ
                </Link>
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="บริการ" data-testid="walkin-services">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={serviceId === s.id}
                    onClick={() => setServiceId(s.id)}
                    className={cn("flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors", serviceId === s.id ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "hover:bg-muted")}
                  >
                    <Sparkles className={cn("size-4 shrink-0", serviceId === s.id ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.durationMin} นาที · {s.price ? thb(s.price) : "ฟรี"}
                        {s.capacity > 1 && ` · รับ ${s.capacity} คน`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Step>

          {service && !group && (
            <Step n={2} title="ผู้ให้บริการ" done={!!staffId}>
              {eligible.length === 0 ? (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                  ยังไม่มีพนักงานที่ทำบริการนี้ —{" "}
                  <Link href={`/t/${slug}/staff`} className="underline">
                    เลือกบริการให้พนักงาน
                  </Link>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ผู้ให้บริการ">
                  <button type="button" role="radio" aria-checked={!staffId} onClick={() => setStaffId("")} className={cn("flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm", !staffId ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "hover:bg-muted")}>
                    <UserRound className="size-4" aria-hidden /> ใครก็ได้ที่ว่าง
                  </button>
                  {eligible.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={staffId === s.id} onClick={() => setStaffId(s.id)} className={cn("flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm", staffId === s.id ? "border-primary bg-primary-soft/60 ring-1 ring-primary" : "hover:bg-muted")}>
                      <Avatar src={s.avatar} name={s.name} color={s.color} size="sm" />
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </Step>
          )}

          {service && (
            <Step n={group ? 2 : 3} title="วันและเวลา" done={!!start}>
              <div className="flex flex-wrap items-center gap-2">
                {quickDates.map((d, i) => (
                  <Button key={d} type="button" size="sm" variant={date === d ? "secondary" : "outline"} className="h-10" onClick={() => setDate(d)}>
                    {i === 0 ? "วันนี้" : i === 1 ? "พรุ่งนี้" : formatThaiYmd(d, { short: true })}
                  </Button>
                ))}
                <Input type="date" value={date} min={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 w-auto" aria-label="เลือกวันที่" />
              </div>
              {ymd && <p className="text-xs text-muted-foreground">{formatThaiYmd(date, { weekday: true })}</p>}
              <SlotPicker slots={slots} selected={start} onSelect={setStart} showRemaining={service.capacity > 1} />
            </Step>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ลูกค้า</CardTitle>
            <CardDescription>ค้นหาลูกค้าเดิมด้วยชื่อหรือเบอร์ หรือกรอกข้อมูลลูกค้าใหม่</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {customerId ? (
              <div className="flex items-center gap-3 rounded-xl border bg-primary-soft/40 p-3 text-sm">
                <Avatar name={name || "?"} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name || "ลูกค้า"}</span>
                  <span className="block text-xs text-muted-foreground">{phone || email || "ลูกค้าเดิม"}</span>
                </span>
                <Button type="button" size="icon-sm" variant="ghost" onClick={clearCustomer} aria-label="เปลี่ยนลูกค้า">
                  <X aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาลูกค้าเดิม (ชื่อ / เบอร์)" className="pl-9" aria-label="ค้นหาลูกค้าเดิม" />
                {searching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
                {hits.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border bg-popover p-1 shadow-md" role="listbox" aria-label="ผลการค้นหาลูกค้า">
                    {hits.map((c) => (
                      <li key={c.id}>
                        <button type="button" role="option" aria-selected={false} onClick={() => pickCustomer(c)} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted">
                          <Avatar name={c.name ?? c.phone ?? "?"} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{c.name ?? "ไม่มีชื่อ"}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {c.phone ?? c.email ?? "—"} · จองแล้ว {c.bookings} ครั้ง
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <Field label="ชื่อลูกค้า" htmlFor="wi-name" error={errors.name}>
              <Input id="wi-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ หรือชื่อเล่น" required maxLength={120} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label="เบอร์โทร" htmlFor="wi-phone" error={errors.phone} hint="ใช้ส่งแจ้งเตือนนัด">
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="wi-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08x-xxx-xxxx" className="pl-9" maxLength={20} />
                </div>
              </Field>
              <Field label="อีเมล" htmlFor="wi-email" error={errors.email}>
                <Input id="wi-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ไม่บังคับ" />
              </Field>
            </div>
            {!customerId && name && !q && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserPlus className="size-3.5" aria-hidden /> ถ้ากรอกเบอร์หรืออีเมล ระบบจะสร้าง/ผูกกับลูกค้าในรายชื่อให้อัตโนมัติ
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดเพิ่มเติม</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex rounded-xl bg-muted p-1" role="radiogroup" aria-label="ช่องทาง">
              {(
                [
                  { key: "walk_in", label: "ลูกค้า walk-in" },
                  { key: "admin", label: "จองแทน (โทร / LINE)" },
                ] as const
              ).map((o) => (
                <button key={o.key} type="button" role="radio" aria-checked={source === o.key} onClick={() => setSource(o.key)} className={cn("min-h-10 flex-1 rounded-lg px-3 text-sm font-medium", source === o.key ? "bg-background shadow-xs" : "text-muted-foreground")}>
                  {o.label}
                </button>
              ))}
            </div>
            {service && service.capacity > 1 && (
              <Field label="จำนวนคน" htmlFor="wi-party" error={errors.partySize}>
                <Input id="wi-party" type="number" inputMode="numeric" min={1} max={Math.min(50, service.capacity)} value={partySize} onChange={(e) => setPartySize(e.target.value)} className="max-w-28" />
              </Field>
            )}
            <Field label="หมายเหตุถึงช่าง/หมอ" htmlFor="wi-note" error={errors.note}>
              <Textarea id="wi-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ขอช่างผู้หญิง แพ้น้ำยาบางชนิด" maxLength={1000} className="min-h-20" />
            </Field>

            <div className="rounded-xl border bg-muted/30 p-3 text-sm" aria-live="polite">
              {service ? (
                <>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-muted-foreground">
                    {selectedSlot ? `${formatThaiYmd(date, { short: true, weekday: true })} · ${formatBkkTime(selectedSlot.start)}–${formatBkkTime(selectedSlot.end)}` : "ยังไม่ได้เลือกเวลา"}
                    {!group && ` · ${staffId ? (eligible.find((s) => s.id === staffId)?.name ?? "") : "ระบบเลือกผู้ให้บริการที่ว่าง"}`}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{service.price ? thb(service.price) : "ฟรี"}</p>
                </>
              ) : (
                <p className="text-muted-foreground">เลือกบริการเพื่อเริ่มจอง</p>
              )}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={pending || !service || !start} data-testid="walkin-submit">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} ยืนยันการจอง
            </Button>
            <p className="text-center text-xs text-muted-foreground">การจองจากแอดมินยืนยันทันที ไม่ต้องชำระมัดจำ</p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
