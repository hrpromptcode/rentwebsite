"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, KeyRound, Loader2, Lock, Upload } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { StockStatusBadge } from "@rentweb/module-topup/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/form";
import { fmtDate } from "@/lib/format";
import { importStockAction, voidStockAction } from "../actions";

export interface StockCodeVM {
  id: string;
  masked: string;
  serial: string | null;
  status: string;
  createdAt: string;
  soldAt: string | null;
  soldOrderNumber: string | null;
  soldOrderId: string | null;
  expiresAt: string | null;
}

export interface StockSummaryVM {
  available: number;
  reserved: number;
  sold: number;
  void: number;
  expired: number;
}

export function StockPanel({
  slug,
  gameId,
  packages,
  selectedId,
  summary,
  codes,
  canWrite,
  hrefFor,
}: {
  slug: string;
  gameId: string;
  packages: Array<{ id: string; name: string; available: number }>;
  selectedId: string;
  summary: StockSummaryVM;
  codes: StockCodeVM[];
  canWrite: boolean;
  hrefFor: string;
}) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [expires, setExpires] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** ADMIN-06: the last import's outcome stays visible (how many were skipped as duplicates and why) */
  const [notice, setNotice] = React.useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const unique = new Set(lines.map((l) => (l.includes("\t") ? l.split("\t", 2)[1]!.trim() : l))).size;
  const selected = packages.find((p) => p.id === selectedId);

  async function importCodes() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const r = await importStockAction(slug, gameId, selectedId, { codes: text, expiresAt: expires });
      if (!r.ok) {
        setError(r.fieldErrors?.codes ?? r.fieldErrors?.expiresAt ?? r.error);
        toast.error(r.error);
        return;
      }
      const nothing = r.data?.imported === 0;
      const dupes = (r.data?.duplicates ?? 0) > 0;
      if (nothing) toast.warning(r.message ?? "ไม่ได้นำเข้าโค้ดใหม่");
      else toast.success(r.message ?? "นำเข้าแล้ว");
      setNotice(r.message ? { text: r.message, tone: nothing || dupes ? "warn" : "ok" } : null);
      setText("");
      setExpires("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {packages.length > 1 && (
        <nav aria-label="เลือกแพ็กเกจ" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-2">
            {packages.map((p) => (
              <li key={p.id}>
                <Link
                  href={`${hrefFor}${p.id}`}
                  aria-current={p.id === selectedId ? "page" : undefined}
                  className={cn("inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors", p.id === selectedId ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}
                >
                  {p.name}
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums", p.available <= 3 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground")}>{p.available}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={`สรุปสต็อก ${selected?.name ?? ""}`}>
        <Stat label="พร้อมขาย" value={summary.available} tone={summary.available <= 3 ? "danger" : "good"} testId="stock-available" />
        <Stat label="ขายแล้ว" value={summary.sold} testId="stock-sold" />
        <Stat label="จองไว้" value={summary.reserved} />
        <Stat label="ยกเลิก / หมดอายุ" value={summary.void + summary.expired} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {canWrite && (
          <section className="card grid content-start gap-4 p-4 sm:p-5" aria-labelledby="stock-import-h">
            <div>
              <h3 id="stock-import-h" className="flex items-center gap-2 font-heading font-semibold">
                <Upload className="size-4" aria-hidden /> นำเข้าโค้ด · {selected?.name}
              </h3>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3 shrink-0" aria-hidden /> โค้ดถูกเข้ารหัสก่อนบันทึก ทีมจะเห็นแบบซ่อนบางส่วนเท่านั้น
              </p>
            </div>
            <Field label="โค้ด (บรรทัดละ 1 โค้ด)" htmlFor="stock-codes" error={error} hint={'มีเลขซีเรียล? ใส่ "ซีเรียล<Tab>โค้ด" ต่อบรรทัด'}>
              <Textarea id="stock-codes" value={text} onChange={(e) => setText(e.target.value)} placeholder={"STEAM-AAAA-BBBB-CCCC\nSTEAM-DDDD-EEEE-FFFF"} className="min-h-40 font-mono text-sm" spellCheck={false} autoComplete="off" aria-invalid={!!error} />
              {notice && (
                <p role="status" className={notice.tone === "warn" ? "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200" : "rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm"}>
                  {notice.text}
                </p>
              )}
            </Field>
            <Field label="วันหมดอายุ (ไม่บังคับ)" htmlFor="stock-expires">
              <Input id="stock-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="w-full sm:w-48" />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {lines.length ? `${unique} โค้ด${lines.length !== unique ? ` (ซ้ำ ${lines.length - unique})` : ""}` : "ยังไม่ได้วางโค้ด"}
              </span>
              <Button onClick={importCodes} disabled={pending || lines.length === 0}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} นำเข้าโค้ด
              </Button>
            </div>
          </section>
        )}

        <section className={cn("card min-w-0 py-0", !canWrite && "lg:col-span-2")} aria-labelledby="stock-list-h">
          <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
            <h3 id="stock-list-h" className="flex items-center gap-2 font-heading font-semibold">
              <KeyRound className="size-4" aria-hidden /> โค้ดล่าสุด
            </h3>
            <span className="text-xs text-muted-foreground">แสดง {codes.length} รายการ</span>
          </div>
          {codes.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">ยังไม่มีโค้ดในสต็อก — วางโค้ดด้านซ้ายแล้วกด “นำเข้าโค้ด”</p>
          ) : (
            <ul className="max-h-[32rem] divide-y overflow-y-auto">
              {codes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5" data-stock-code={c.id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm font-medium">{c.masked}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.serial ? `ซีเรียล ${c.serial} · ` : ""}เพิ่ม {fmtDate(c.createdAt)}
                      {c.expiresAt ? ` · หมดอายุ ${fmtDate(c.expiresAt)}` : ""}
                      {c.soldOrderNumber && c.soldOrderId ? (
                        <>
                          {" · ขายให้ "}
                          <Link href={`/t/${slug}/topup/orders/${c.soldOrderId}`} className="text-primary hover:underline">
                            {c.soldOrderNumber}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <StockStatusBadge status={c.status} />
                  {canWrite && (c.status === "available" || c.status === "reserved") ? (
                    <ConfirmButton variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" title={`ยกเลิกโค้ด ${c.masked}?`} description="โค้ดนี้จะไม่ถูกนำไปขาย (เช่น โค้ดเสีย / ใช้ไปแล้ว) ย้อนกลับไม่ได้" confirmLabel="ยกเลิกโค้ด" action={() => voidStockAction(slug, gameId, c.id)} aria-label={`ยกเลิกโค้ด ${c.masked}`}>
                      <Ban aria-hidden />
                    </ConfirmButton>
                  ) : (
                    <span className="size-9 shrink-0" aria-hidden />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, testId }: { label: string; value: number; tone?: "good" | "danger"; testId?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-heading text-2xl font-semibold tabular-nums", tone === "danger" && "text-destructive", tone === "good" && "text-emerald-700")} data-testid={testId}>
        {value.toLocaleString("th-TH")}
      </p>
    </div>
  );
}
