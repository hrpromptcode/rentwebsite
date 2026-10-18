"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Eye, EyeOff, FlaskConical, Info, Loader2, Save, Trash2, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Switch } from "@rentweb/ui/components/switch";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { Field, useAction } from "@/components/ui/form";
import { clearLineLogin, saveLineLogin, testLineLogin, type LineTestReport } from "./actions";

export interface LineLoginInitial {
  enabled: boolean;
  channelId: string;
  /** last 4 characters of the stored secret; null = none stored */
  secretHint: string | null;
}

/* client mirrors of lineChannelIdError / lineChannelSecretError (the server action re-checks with the core functions) */
const CHANNEL_ID_RE = /^[0-9]{6,20}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{16,128}$/;
const CHANNEL_ID_ERROR = "Channel ID ต้องเป็นตัวเลขล้วน (ดูได้จาก LINE Developers Console > Basic settings)";
const SECRET_ERROR = "Channel secret มีอักขระที่ไม่ถูกต้อง (ปกติเป็นตัวอักษร a-f และตัวเลข 32 ตัว)";
const CONSOLE_URL = "https://developers.line.biz/console/";

function LineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-5", className)} fill="currentColor">
      <path d="M24 6C12.95 6 4 13.27 4 22.24c0 8.05 7.14 14.79 16.78 16.06.65.14 1.54.43 1.77.99.2.5.13 1.3.06 1.8l-.28 1.72c-.09.5-.4 1.98 1.73 1.08 2.14-.9 11.52-6.78 15.72-11.61C42.68 28.9 44 25.73 44 22.24 44 13.27 35.05 6 24 6Zm-8.1 21.1h-3.98a1.05 1.05 0 0 1-1.05-1.05v-7.97a1.05 1.05 0 0 1 2.1 0v6.92h2.93a1.05 1.05 0 1 1 0 2.1Zm3.05-1.05a1.05 1.05 0 1 1-2.1 0v-7.97a1.05 1.05 0 1 1 2.1 0v7.97Zm9.62 0a1.05 1.05 0 0 1-1.05 1.05.99.99 0 0 1-.84-.42l-4.09-5.56v4.93a1.05 1.05 0 1 1-2.1 0v-7.97a1.05 1.05 0 0 1 1.05-1.05c.33 0 .64.16.84.42l4.09 5.56v-4.93a1.05 1.05 0 1 1 2.1 0v7.97Zm6.45-5.03a1.05 1.05 0 1 1 0 2.1h-2.93v1.88h2.93a1.05 1.05 0 1 1 0 2.1h-3.98a1.05 1.05 0 0 1-1.05-1.05v-7.97a1.05 1.05 0 0 1 1.05-1.05h3.98a1.05 1.05 0 1 1 0 2.1h-2.93v1.89h2.93Z" />
    </svg>
  );
}

type Saved = { enabled: boolean; channelId: string; secretHint: string | null };
type State = "ready" | "off" | "unconfigured";

function StatusBanner({ state, storefrontLoginUrl, dirty }: { state: State; storefrontLoginUrl: string; dirty: boolean }) {
  const note = dirty ? <p className="text-xs opacity-80">สถานะนี้มาจากค่าที่บันทึกไว้ — กด “บันทึก” เพื่อใช้การเปลี่ยนแปลงด้านล่าง</p> : null;
  if (state === "ready") {
    return (
      <div role="status" data-testid="line-status" data-state="ready" className="flex gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <div className="grid min-w-0 gap-1">
          <p className="font-medium">ลูกค้าเข้าสู่ระบบด้วย LINE ได้แล้ว</p>
          <p className="text-sm">หน้าเข้าสู่ระบบของหน้าร้านแสดงปุ่ม “เข้าสู่ระบบด้วย LINE” และลูกค้าเดิมเชื่อมต่อ LINE กับบัญชีได้จากหน้า “บัญชีของฉัน”</p>
          <a href={storefrontLoginUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline underline-offset-2 sm:min-h-0">
            เปิดหน้าเข้าสู่ระบบของหน้าร้าน <ExternalLink className="size-3.5" aria-hidden />
          </a>
          {note}
        </div>
      </div>
    );
  }
  if (state === "off") {
    return (
      <div role="status" data-testid="line-status" data-state="off" className="flex gap-3 rounded-xl border border-sky-300 bg-sky-50 p-4 text-sky-950 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100">
        <Info className="mt-0.5 size-5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
        <div className="grid min-w-0 gap-1">
          <p className="font-medium">ตั้งค่า LINE Login ไว้แล้ว แต่ยังปิดใช้งานอยู่</p>
          <p className="text-sm">เปิดสวิตช์ด้านล่างแล้วกด “บันทึก” ลูกค้าจึงจะเห็นปุ่ม LINE ที่หน้าร้าน</p>
          {note}
        </div>
      </div>
    );
  }
  return (
    <div role="status" data-testid="line-status" data-state="unconfigured" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <div className="grid min-w-0 gap-1">
        <p className="font-medium">ยังไม่ได้ตั้งค่า LINE Login — ลูกค้ายังเข้าสู่ระบบด้วย LINE ไม่ได้</p>
        <p className="text-sm">สร้าง LINE Login channel แล้วนำ Channel ID และ Channel secret มากรอก วาง Callback URL ด้านล่างใน LINE Developers Console จากนั้นเปิดสวิตช์และกด “บันทึก”</p>
        {note}
      </div>
    </div>
  );
}

type Report = { ok: boolean; error?: string; data?: LineTestReport };

function TestReport({ report }: { report: Report }) {
  const d = report.data;
  const tone: "ok" | "warn" | "error" = !report.ok ? "error" : d && d.probe === "reachable" && d.warnings.length === 0 ? "ok" : "warn";
  const probeIcon = d?.probe === "reachable" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : d?.probe === "rejected" ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />;
  return (
    <div
      role="status"
      data-testid="line-test-result"
      data-probe={d?.probe ?? "shape"}
      className={cn(
        "rounded-xl border p-4",
        tone === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100",
        tone === "error" && "border-destructive/40 bg-destructive/10 text-foreground",
      )}
    >
      <p className="mb-2 text-sm font-medium">ผลการทดสอบ</p>
      <ul className="grid gap-1.5 text-sm">
        {report.error && (
          <li className="flex gap-2">
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden /> <span>{report.error}</span>
          </li>
        )}
        {d && (
          <>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> <span>รูปแบบ Channel ID ถูกต้อง ({d.channelId})</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> <span>รูปแบบ Channel secret ถูกต้อง{d.usedStoredSecret ? " (ใช้ค่าที่บันทึกไว้)" : ""}</span>
            </li>
            {d.warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden /> <span>{w}</span>
              </li>
            ))}
            <li className="flex gap-2">
              {probeIcon} <span>{d.probeDetail}</span>
            </li>
            <li className="break-all text-xs opacity-70">ปลายทางที่ทดสอบ: {d.endpoint}</li>
          </>
        )}
      </ul>
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("คัดลอก Callback URL แล้ว");
  } catch {
    toast.error("คัดลอกอัตโนมัติไม่ได้ — เลือกข้อความแล้วคัดลอกเอง");
  }
}

export function LineLoginForm({ slug, initial, callbackUrls, storefrontLoginUrl, canEdit, mockMode }: { slug: string; initial: LineLoginInitial; callbackUrls: string[]; storefrontLoginUrl: string; canEdit: boolean; mockMode: boolean }) {
  const [saved, setSaved] = React.useState<Saved>(initial);
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [channelId, setChannelId] = React.useState(initial.channelId);
  const [secret, setSecret] = React.useState("");
  const [showSecret, setShowSecret] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [report, setReport] = React.useState<Report | null>(null);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const id = channelId.trim();
  const sec = secret.trim();
  const idError = id && !CHANNEL_ID_RE.test(id) ? CHANNEL_ID_ERROR : null;
  const secretError = sec && !SECRET_RE.test(sec) ? SECRET_ERROR : null;
  const hasSecret = !!sec || saved.secretHint !== null;
  const credsReady = !!id && !idError && hasSecret && !secretError;
  const configured = !!saved.channelId && saved.secretHint !== null;
  const dirty = enabled !== saved.enabled || id !== saved.channelId || !!sec;
  const state: State = configured && saved.enabled ? "ready" : configured ? "off" : "unconfigured";

  const [save, saving] = useAction(saveLineLogin, {
    onSuccess: () => {
      setSaved({ enabled, channelId: id || saved.channelId, secretHint: sec ? sec.slice(-4) : saved.secretHint });
      setSecret("");
      setTouched(false);
    },
  });
  const [test, testing] = useAction(testLineLogin);
  const [clear, clearing] = useAction(clearLineLogin, {
    onSuccess: () => {
      setSaved({ enabled: false, channelId: "", secretHint: null });
      setEnabled(false);
      setChannelId("");
      setSecret("");
      setReport(null);
      setConfirmClear(false);
    },
  });

  const runTest = async () => {
    setTouched(true);
    if (!id) return toast.error("กรุณากรอก Channel ID ก่อนทดสอบ");
    if (idError || secretError) return toast.error(idError ?? secretError ?? "ข้อมูลไม่ถูกต้อง");
    const r = await test(slug, { channelId: id, channelSecret: sec });
    if (!r) return;
    if (r.ok) setReport({ ok: true, data: r.data as LineTestReport | undefined });
    else setReport({ ok: false, error: r.error, data: (r as { data?: LineTestReport }).data });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (idError || secretError) {
      document.getElementById(idError ? "line-channel-id" : "line-channel-secret")?.focus();
      return;
    }
    if (enabled && !credsReady) {
      toast.error("กรอก Channel ID และ Channel secret ให้ครบก่อนเปิดใช้งาน LINE Login");
      return;
    }
    void save(slug, { enabled, channelId: id, channelSecret: sec });
  };

  const reset = () => {
    setEnabled(saved.enabled);
    setChannelId(saved.channelId);
    setSecret("");
    setTouched(false);
  };

  const switchLocked = !canEdit || (!enabled && !credsReady);

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <StatusBanner state={state} storefrontLoginUrl={storefrontLoginUrl} dirty={dirty} />
      {mockMode && (
        <p role="note" data-testid="line-mock-note" className="flex gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            โหมดจำลอง LINE (LINE_MOCK=1) เปิดอยู่บนเซิร์ฟเวอร์นี้ — ปุ่ม LINE บนหน้าร้านจะพาไปหน้าจำลองสำหรับนักพัฒนา ไม่ใช่ LINE จริง และ “ทดสอบการตั้งค่า” จะติดต่อตัวจำลองแทน
          </span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#06C755] text-white" aria-hidden>
              <LineMark className="size-4" />
            </span>
            เข้าสู่ระบบด้วย LINE
          </CardTitle>
          <CardDescription>ให้ลูกค้าเข้าสู่ระบบหน้าร้านด้วยบัญชี LINE ได้ในคลิกเดียว ควบคู่กับรหัส OTP ทางเบอร์โทรศัพท์หรืออีเมล — ระบบจดจำลูกค้าจาก LINE user ID ของร้านนี้เท่านั้น ไม่นำอีเมลจาก LINE ไปรวมกับบัญชีอื่น</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="line-enabled" className="font-medium">
                เปิดให้ลูกค้าเข้าสู่ระบบด้วย LINE
              </Label>
              <p className="text-xs text-muted-foreground">เมื่อเปิด หน้าเข้าสู่ระบบของหน้าร้านจะแสดงปุ่ม “เข้าสู่ระบบด้วย LINE” และหน้า “บัญชีของฉัน” จะมีปุ่ม “เชื่อมต่อ LINE”</p>
              {!enabled && !credsReady && <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">กรอก Channel ID และ Channel secret ด้านล่างให้ครบก่อน จึงจะเปิดได้</p>}
            </div>
            <Switch id="line-enabled" data-testid="line-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={switchLocked} aria-describedby="line-enabled-hint" />
          </div>
          <p id="line-enabled-hint" className="sr-only">
            {switchLocked && !enabled ? "ต้องกรอก Channel ID และ Channel secret ก่อน" : "เปิดหรือปิดการเข้าสู่ระบบด้วย LINE บนหน้าร้าน"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูล channel จาก LINE Developers Console</CardTitle>
          <CardDescription>ใช้ channel ประเภท “LINE Login” (ไม่ใช่ Messaging API) ของร้านคุณเอง</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm text-muted-foreground marker:font-medium marker:text-foreground">
            <li>
              เข้า{" "}
              <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2">
                LINE Developers Console <ExternalLink className="size-3.5" aria-hidden />
              </a>{" "}
              → เลือกหรือสร้าง Provider → “Create a new channel” ประเภท <strong className="text-foreground">LINE Login</strong> (App type: Web app)
            </li>
            <li>
              แท็บ <strong className="text-foreground">Basic settings</strong>: คัดลอก Channel ID และ Channel secret มากรอกด้านล่าง
            </li>
            <li>
              แท็บ <strong className="text-foreground">LINE Login</strong>: วาง Callback URL (การ์ดถัดไป ทุกบรรทัด) ในช่อง Callback URL
            </li>
            <li>
              เมื่อพร้อมให้ลูกค้าจริงใช้งาน กด <strong className="text-foreground">Publish</strong> channel (ระหว่างสถานะ Developing จะเข้าสู่ระบบได้เฉพาะบัญชีทดสอบของ channel) — ต้องการอีเมลลูกค้าด้วย ให้ขอสิทธิ์ “Email address permission” เพิ่ม (ไม่บังคับ)
            </li>
          </ol>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Channel ID" htmlFor="line-channel-id" hint="ตัวเลข 10 หลัก จากแท็บ Basic settings" error={touched ? idError : null}>
              <Input id="line-channel-id" data-testid="line-channel-id" inputMode="numeric" autoComplete="off" value={channelId} onChange={(e) => setChannelId(e.target.value)} onBlur={() => setTouched(true)} placeholder="1234567890" maxLength={20} aria-invalid={(touched && !!idError) || undefined} disabled={!canEdit} />
            </Field>
            <Field
              label="Channel secret"
              htmlFor="line-channel-secret"
              hint={saved.secretHint !== null ? `บันทึกไว้แล้ว (ลงท้าย …${saved.secretHint}) — เว้นว่างเพื่อใช้ค่าเดิม หรือกรอกค่าใหม่เพื่อเปลี่ยน` : "ตัวอักษร a-f และตัวเลข 32 ตัว จากแท็บ Basic settings — ระบบเก็บแบบเข้ารหัสและจะไม่แสดงอีก"}
              error={touched ? secretError : null}
            >
              <div className="relative">
                <Input
                  id="line-channel-secret"
                  data-testid="line-channel-secret"
                  type={showSecret ? "text" : "password"}
                  autoComplete="new-password"
                  spellCheck={false}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={saved.secretHint !== null ? `••••••••••••••••••••••••••••${saved.secretHint}` : "เช่น 0123456789abcdef0123456789abcdef"}
                  maxLength={200}
                  className="pr-11"
                  aria-invalid={(touched && !!secretError) || undefined}
                  disabled={!canEdit}
                />
                <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 right-1 size-8 -translate-y-1/2 text-muted-foreground" aria-label={showSecret ? "ซ่อน Channel secret" : "แสดง Channel secret"} aria-pressed={showSecret} onClick={() => setShowSecret((v) => !v)} disabled={!canEdit}>
                  {showSecret ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" data-testid="line-test" onClick={runTest} disabled={testing || !canEdit}>
              {testing ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical aria-hidden />} ทดสอบการตั้งค่า
            </Button>
            <p className="text-xs text-muted-foreground">ตรวจรูปแบบและลองติดต่อเซิร์ฟเวอร์ LINE ด้วยค่าที่กรอก (ไม่บันทึก และไม่มีลูกค้าเกี่ยวข้อง)</p>
          </div>
          {report && <TestReport report={report} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Callback URL</CardTitle>
          <CardDescription>คัดลอกไปวางในช่อง Callback URL ของ LINE Login channel ให้ตรงทุกตัวอักษร (รวม https:// และไม่มี / ปิดท้าย){callbackUrls.length > 1 ? " — ร้านนี้มีหลายโดเมน ต้องเพิ่มทุกบรรทัด" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {callbackUrls.map((u) => (
            <div key={u} className="flex items-center gap-2 rounded-xl border bg-muted/40 p-2 pl-3">
              <code data-testid="line-callback-url" className="min-w-0 flex-1 break-all font-mono text-xs sm:text-sm">
                {u}
              </code>
              <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label={`คัดลอก ${u}`} onClick={() => void copyText(u)}>
                <Copy aria-hidden />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {configured && canEdit && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base">ลบข้อมูลการเชื่อมต่อ</CardTitle>
            <CardDescription>ลบ Channel ID และ Channel secret ออกจากระบบและปิดใช้งาน LINE Login — ลูกค้าที่เคยเชื่อมต่อยังคงข้อมูลไว้ แต่จะเข้าสู่ระบบด้วย LINE ไม่ได้จนกว่าจะตั้งค่าใหม่</CardDescription>
          </CardHeader>
          <CardContent>
            {!confirmClear ? (
              <Button type="button" variant="outline" className="text-destructive hover:text-destructive" data-testid="line-clear" onClick={() => setConfirmClear(true)} disabled={clearing}>
                <Trash2 aria-hidden /> ลบข้อมูลการเชื่อมต่อ
              </Button>
            ) : (
              <div className="grid gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" aria-live="polite">
                <p className="text-sm">ยืนยันลบ Channel ID และ Channel secret ของ LINE Login? ลูกค้าจะเข้าสู่ระบบด้วย LINE ไม่ได้ทันที</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="destructive" data-testid="line-clear-confirm" onClick={() => void clear(slug)} disabled={clearing}>
                    {clearing ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />} ยืนยันลบ
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmClear(false)} disabled={clearing}>
                    ไม่ใช่ตอนนี้
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        {dirty && <span className="mr-auto text-xs text-muted-foreground">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>}
        <Button type="button" variant="ghost" onClick={reset} disabled={!dirty || saving}>
          คืนค่า
        </Button>
        <Button type="submit" data-testid="line-save" disabled={!dirty || saving || !canEdit}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึก
        </Button>
      </div>
    </form>
  );
}
