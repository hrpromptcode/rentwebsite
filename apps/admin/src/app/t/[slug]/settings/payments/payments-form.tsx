"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, CheckCircle2, Loader2, Plus, QrCode, Save, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Checkbox } from "@rentweb/ui/components/checkbox";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { Switch } from "@rentweb/ui/components/switch";
import { Field, useAction } from "@/components/ui/form";
import { savePayments } from "../actions";
import { PROMPTPAY_ID_ERROR, THAI_BANKS, validPromptpayId, type PaymentsInput } from "../shared";

type Enabled = PaymentsInput["enabled"];

/** paymentSetupStatus() (@rentweb/core/payments) of the SAVED settings, computed by the page (ADMIN_B2-09). */
export interface SavedPaymentStatus {
  promptpayId: string | null;
  /** the PromptPay receiver is the shop's contact phone (opt-in), not a saved PromptPay ID */
  promptpayFromContact: boolean;
  bankAccounts: number;
  online: Array<"promptpay_qr" | "slip">;
  offline: Array<"cod" | "cash">;
  ready: boolean;
}

/** 0812345678 → 081-234-5678, 13-digit ID → 1-2345-67890-12-3 */
function formatPromptpay(id: string) {
  if (/^[0-9]{10}$/.test(id)) return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
  if (/^[0-9]{13}$/.test(id)) return `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`;
  return id;
}

const OFFLINE_LABEL: Record<"cod" | "cash", string> = { cod: "เก็บเงินปลายทาง", cash: "เงินสดหน้าร้าน" };

function SetupStatus({ status, dirty }: { status: SavedPaymentStatus; dirty: boolean }) {
  const note = dirty ? <p className="text-xs opacity-80">สถานะนี้มาจากค่าที่บันทึกไว้ — กด “บันทึก” เพื่อใช้การเปลี่ยนแปลงด้านล่าง</p> : null;
  if (!status.ready) {
    return (
      <div role="status" data-testid="payment-setup-status" data-ready="false" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="grid min-w-0 gap-1">
          <p className="font-medium">ลูกค้ายังชำระเงินออนไลน์ไม่ได้ จนกว่าจะตั้งค่า PromptPay หรือบัญชีธนาคาร</p>
          <p className="text-sm">
            กรอก PromptPay ID หรือเพิ่มบัญชีธนาคาร เปิดช่องทางนั้นด้านล่าง แล้วกด “บันทึก” — ระหว่างนี้หน้าร้านจะแจ้งลูกค้าว่าร้านยังไม่ได้ตั้งค่าช่องทางรับชำระเงิน
            {status.offline.length ? ` และรับได้เฉพาะ${status.offline.map((m) => OFFLINE_LABEL[m]).join(" / ")}` : ""}
          </p>
          {note}
        </div>
      </div>
    );
  }
  return (
    <div role="status" data-testid="payment-setup-status" data-ready="true" className="flex gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <div className="grid min-w-0 gap-1">
        <p className="font-medium">ลูกค้าชำระเงินออนไลน์ได้แล้ว</p>
        <ul className="grid gap-0.5 text-sm">
          {status.online.includes("promptpay_qr") && status.promptpayId && (
            <li>
              PromptPay QR → <span className="font-medium tabular-nums">{formatPromptpay(status.promptpayId)}</span>
              {status.promptpayFromContact ? " (เบอร์โทรร้าน)" : ""}
            </li>
          )}
          {status.online.includes("slip") && <li>โอนเงิน + แนบสลิป → บัญชีธนาคาร {status.bankAccounts} บัญชี</li>}
          {status.offline.length > 0 && <li>รับที่ร้าน / ปลายทาง: {status.offline.map((m) => OFFLINE_LABEL[m]).join(" / ")}</li>}
        </ul>
        {note}
      </div>
    </div>
  );
}

const METHODS: Array<{ key: keyof Enabled; label: string; hint: string; needs?: "promptpay" | "bank" | "wallet" }> = [
  { key: "promptpay", label: "PromptPay QR", hint: "ลูกค้าสแกนจ่าย ระบบสร้าง QR พร้อมยอดให้อัตโนมัติ", needs: "promptpay" },
  { key: "bankTransfer", label: "โอนเงิน + แนบสลิป", hint: "แสดงเลขบัญชีและให้ลูกค้าอัปโหลดสลิป", needs: "bank" },
  { key: "cod", label: "เก็บเงินปลายทาง (COD)", hint: "เหมาะกับสินค้าจัดส่ง" },
  { key: "cash", label: "ชำระเงินสดหน้าร้าน", hint: "สำหรับรับที่ร้าน / การจอง" },
  { key: "card", label: "บัตรเครดิต/เดบิต", hint: "ต้องเชื่อมผู้ให้บริการชำระเงินก่อน (เร็วๆ นี้)" },
  { key: "wallet", label: "กระเป๋าเงินในเว็บ (Wallet)", hint: "ลูกค้าเติมเงินแล้วใช้จ่ายในร้าน", needs: "wallet" },
];

export function PaymentsForm({ slug, initial, status, contactPhone, contactMobile, canEdit, hasWallet }: { slug: string; initial: PaymentsInput; status: SavedPaymentStatus; contactPhone: string; contactMobile: string | null; canEdit: boolean; hasWallet: boolean }) {
  const [form, setForm] = React.useState<PaymentsInput>(initial);
  const [saved, setSaved] = React.useState(initial);
  const [ppTouched, setPpTouched] = React.useState(false);
  const [run, pending] = useAction(savePayments, { onSuccess: () => setSaved(form) });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  // ADMIN_B2-09: the same rule checkout uses (resolvePromptpayId) — a saved ID must be valid; the contact phone only
  // counts when the owner opted in AND it is a Thai mobile number.
  const ppRaw = (form.promptpayId ?? "").trim();
  const ppError = ppRaw && !validPromptpayId(ppRaw) ? PROMPTPAY_ID_ERROR : null;
  const usePhone = !!form.promptpayUseContactPhone;
  const promptpayReady = ppRaw ? !ppError : usePhone && !!contactMobile;
  const bankReady = form.bankAccounts.some((a) => a.number.trim());
  const phoneHint = ppRaw
    ? "ไม่มีผล เพราะกรอก PromptPay ID ไว้แล้ว (ระบบใช้ PromptPay ID ก่อนเสมอ)"
    : !contactPhone
      ? null
      : contactMobile
        ? `เลือกเฉพาะเมื่อเบอร์ ${contactPhone} ผูกพร้อมเพย์กับบัญชีของร้านแล้ว — ลูกค้าจะโอนเข้าเบอร์นี้`
        : `เบอร์โทรร้าน (${contactPhone}) ไม่ใช่เบอร์มือถือ จึงใช้รับ PromptPay ไม่ได้ — กรอก PromptPay ID แทน`;

  const setAccount = (i: number, patch: Partial<PaymentsInput["bankAccounts"][number]>) => setForm({ ...form, bankAccounts: form.bankAccounts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (ppError) {
          setPpTouched(true);
          document.getElementById("p-id")?.focus();
          return;
        }
        void run(slug, form);
      }}
    >
      <SetupStatus status={status} dirty={dirty} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" aria-hidden /> PromptPay
          </CardTitle>
          <CardDescription>ใช้สร้าง QR Code พร้อมยอดให้ลูกค้าสแกนจ่าย — เงินเข้าบัญชีที่ผูกกับ PromptPay ID นี้</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="PromptPay ID" htmlFor="p-id" hint="เบอร์มือถือ 10 หลัก (06 / 08 / 09) เลขประจำตัวประชาชนหรือผู้เสียภาษี 13 หลัก หรือเลข e-Wallet 15 หลัก" error={ppTouched ? ppError : null}>
            <Input
              id="p-id"
              inputMode="numeric"
              value={form.promptpayId ?? ""}
              onChange={(e) => setForm({ ...form, promptpayId: e.target.value })}
              onBlur={() => setPpTouched(true)}
              placeholder="0812345678"
              maxLength={20}
              aria-invalid={(ppTouched && !!ppError) || undefined}
              disabled={!canEdit}
            />
          </Field>
          <Field label="ชื่อบัญชี PromptPay" htmlFor="p-name" hint="แสดงใต้ QR เพื่อให้ลูกค้าตรวจสอบก่อนโอน">
            <Input id="p-name" value={form.promptpayName ?? ""} onChange={(e) => setForm({ ...form, promptpayName: e.target.value })} placeholder="บจก. ร้านของฉัน" maxLength={80} disabled={!canEdit} />
          </Field>
          <div className="flex items-start gap-3 sm:col-span-2">
            <Checkbox id="p-use-phone" className="mt-0.5" checked={usePhone} onCheckedChange={(v) => setForm({ ...form, promptpayUseContactPhone: v === true })} disabled={!canEdit} aria-describedby="p-use-phone-hint" />
            <div className="grid min-w-0 gap-1">
              <Label htmlFor="p-use-phone" className="font-medium leading-snug">
                ไม่ได้กรอก PromptPay ID? ใช้เบอร์มือถือของร้านรับ PromptPay
              </Label>
              <p id="p-use-phone-hint" className={!ppRaw && contactPhone && !contactMobile ? "text-xs text-amber-700 dark:text-amber-400" : "text-xs text-muted-foreground"}>
                {phoneHint ?? (
                  <>
                    ยังไม่มีเบอร์โทรร้าน — เพิ่มได้ที่{" "}
                    <Link href={`/t/${slug}/settings`} className="underline underline-offset-2">
                      ตั้งค่าทั่วไป
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="size-5 text-primary" aria-hidden /> บัญชีธนาคารรับโอน
          </CardTitle>
          <CardDescription>แสดงให้ลูกค้าเมื่อเลือกโอนเงินและแนบสลิป เพิ่มได้สูงสุด 10 บัญชี</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {form.bankAccounts.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีบัญชีธนาคาร</p>}
          {form.bankAccounts.map((a, i) => (
            <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-end">
              <div className="grid gap-1.5">
                <Label htmlFor={`bank-${i}`}>ธนาคาร</Label>
                <Select value={a.bank} onValueChange={(v) => setAccount(i, { bank: v })} disabled={!canEdit}>
                  <SelectTrigger id={`bank-${i}`} className="w-full">
                    <SelectValue placeholder="เลือกธนาคาร" />
                  </SelectTrigger>
                  <SelectContent>
                    {THAI_BANKS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                    {a.bank && !(THAI_BANKS as readonly string[]).includes(a.bank) && <SelectItem value={a.bank}>{a.bank}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`acct-name-${i}`}>ชื่อบัญชี</Label>
                <Input id={`acct-name-${i}`} value={a.name} onChange={(e) => setAccount(i, { name: e.target.value })} maxLength={80} disabled={!canEdit} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`acct-no-${i}`}>เลขบัญชี</Label>
                <Input id={`acct-no-${i}`} inputMode="numeric" value={a.number} onChange={(e) => setAccount(i, { number: e.target.value })} maxLength={30} disabled={!canEdit} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="ลบบัญชี" className="justify-self-end text-destructive hover:text-destructive" onClick={() => setForm({ ...form, bankAccounts: form.bankAccounts.filter((_, j) => j !== i) })} disabled={!canEdit}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          {canEdit && form.bankAccounts.length < 10 && (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => setForm({ ...form, bankAccounts: [...form.bankAccounts, { bank: "", name: "", number: "" }] })}>
              <Plus aria-hidden /> เพิ่มบัญชี
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ช่องทางที่เปิดรับ</CardTitle>
          <CardDescription>ลูกค้าจะเห็นเฉพาะช่องทางที่เปิดและตั้งค่าครบแล้ว</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {METHODS.filter((m) => m.needs !== "wallet" || hasWallet).map((m) => {
            const notReady = (m.needs === "promptpay" && !promptpayReady) || (m.needs === "bank" && !bankReady);
            return (
              <div key={m.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Label htmlFor={`m-${m.key}`} className="font-medium">
                    {m.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{m.hint}</p>
                  {form.enabled[m.key] && notReady && <p className="mt-0.5 text-xs text-amber-600">ยังไม่พร้อมใช้งาน กรุณากรอกข้อมูลด้านบนก่อน</p>}
                </div>
                <Switch id={`m-${m.key}`} checked={form.enabled[m.key]} onCheckedChange={(v) => setForm({ ...form, enabled: { ...form.enabled, [m.key]: v } })} disabled={!canEdit} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวเลือกเพิ่มเติม</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="p-auto" className="font-medium">
                อนุมัติสลิปอัตโนมัติ
              </Label>
              <p className="text-xs text-muted-foreground">ออเดอร์จะเปลี่ยนเป็น “ชำระแล้ว” ทันทีที่ลูกค้าอัปโหลดสลิป (ควรเปิดเฉพาะร้านที่ตรวจสอบภายหลัง)</p>
            </div>
            <Switch id="p-auto" checked={form.autoApproveSlips} onCheckedChange={(v) => setForm({ ...form, autoApproveSlips: v })} disabled={!canEdit} />
          </div>
          <Field label="QR หมดอายุภายใน (นาที)" htmlFor="p-exp" hint="5 – 1440 นาที ค่าเริ่มต้น 30" className="max-w-xs">
            <Input id="p-exp" type="number" inputMode="numeric" min={5} max={1440} value={String(form.expiresMinutes ?? "")} onChange={(e) => setForm({ ...form, expiresMinutes: Number(e.target.value) })} disabled={!canEdit} />
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        {dirty && <span className="mr-auto text-xs text-muted-foreground">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>}
        <Button type="button" variant="ghost" onClick={() => setForm(saved)} disabled={!dirty || pending}>
          คืนค่า
        </Button>
        <Button type="submit" disabled={!dirty || pending || !canEdit}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
        </Button>
      </div>
    </form>
  );
}
