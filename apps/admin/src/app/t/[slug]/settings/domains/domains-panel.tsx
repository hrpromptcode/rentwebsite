"use client";

import * as React from "react";
import { AlertTriangle, Check, Clock, Copy, ExternalLink, Globe, Loader2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentweb/ui/components/card";
import { Input } from "@rentweb/ui/components/input";
import { toast } from "@rentweb/ui/components/sonner";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, useAction } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/status-badge";
import { fmtRelative } from "@/lib/format";
import { addDomain, removeDomain, verifyDomain } from "../actions";

export interface DomainRow {
  id: string;
  hostname: string;
  kind: "subdomain" | "custom";
  isPrimary: boolean;
  status: "pending" | "verifying" | "active" | "failed";
  verificationToken: string | null;
  sslStatus: string | null;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  lastError: string | null;
  /** records to add at the DNS provider (custom domains), from domainDnsInstructions() in @rentweb/core/tenant */
  dns: { txt: { name: string; value: string }; cname: { name: string; value: string } } | null;
}

/** ADMIN_B2-11: what each state means for visitors (only "active" domains route to the storefront). */
const STATUS_HELP: Record<DomainRow["status"], string> = {
  pending: "ยังไม่เปิดใช้ — ลูกค้าจะเข้าเว็บผ่านโดเมนนี้ได้หลังยืนยัน DNS สำเร็จเท่านั้น",
  verifying: "กำลังตรวจสอบ DNS…",
  active: "ยืนยันความเป็นเจ้าของแล้ว ลูกค้าเข้าเว็บผ่านโดเมนนี้ได้",
  failed: "ตรวจสอบไม่ผ่าน โดเมนยังไม่เปิดใช้ — แก้ค่า DNS ตามด้านล่างแล้วกด “ตรวจสอบ DNS” อีกครั้ง",
};

const DOMAIN_STATUS: Record<DomainRow["status"], string> = { pending: "รอตั้งค่า DNS", verifying: "กำลังตรวจสอบ", active: "ใช้งานได้", failed: "ตรวจสอบไม่ผ่าน" };

function DnsRecord({ step, type, purpose, name, value }: { step: number; type: string; purpose: string; name: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg border bg-background p-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {step}. {type}
        </span>{" "}
        — {purpose}
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-center sm:gap-x-3">
        <span className="text-xs text-muted-foreground">ชื่อ (Host)</span>
        <CopyValue value={name} label={`ชื่อ ${type}`} />
        <span className="text-xs text-muted-foreground">ค่า (Value)</span>
        <CopyValue value={value} label={`ค่า ${type}`} />
      </div>
    </div>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`คัดลอก${label}แล้ว`);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("คัดลอกไม่สำเร็จ");
        }
      }}
      className="group inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-left font-mono text-xs hover:bg-muted sm:text-sm"
      aria-label={`คัดลอก${label}: ${value}`}
    >
      <span className="truncate">{value}</span>
      {copied ? <Check className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <Copy className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />}
    </button>
  );
}

export function DomainsPanel({ slug, domains, systemHost, cnameTarget, storefrontUrl, canEdit }: { slug: string; domains: DomainRow[]; systemHost: string; cnameTarget: string; storefrontUrl: string; canEdit: boolean }) {
  const [hostname, setHostname] = React.useState("");
  const [add, adding] = useAction(addDomain, { onSuccess: () => setHostname("") });
  const [verify, verifying] = useAction(verifyDomain);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const custom = domains.filter((d) => d.kind === "custom");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-5 text-primary" aria-hidden /> โดเมนของระบบ
          </CardTitle>
          <CardDescription>ที่อยู่นี้ใช้งานได้ทันทีและจะยังใช้ได้แม้เพิ่มโดเมนส่วนตัวแล้ว</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <CopyValue value={systemHost} label="โดเมน" />
          <Badge variant="success">ใช้งานได้</Badge>
          <Button asChild variant="ghost" size="sm">
            <a href={storefrontUrl} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> เปิดหน้าร้าน
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>โดเมนส่วนตัว</CardTitle>
          <CardDescription>เชื่อมโดเมนที่คุณเป็นเจ้าของ เช่น www.myshop.com (ใช้ได้ตามแพ็กเกจ)</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-5">
          {canEdit && (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void add(slug, hostname);
              }}
            >
              <Field label="ชื่อโดเมน" htmlFor="d-host" className="flex-1">
                <Input id="d-host" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="www.myshop.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
              </Field>
              <Button type="submit" disabled={adding || !hostname.trim()}>
                {adding ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} เพิ่มโดเมน
              </Button>
            </form>
          )}

          {custom.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีโดเมนส่วนตัว</p>
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4">
              {custom.map((d) => (
                <li key={d.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.hostname}</span>
                    <StatusBadge status={d.status} label={DOMAIN_STATUS[d.status]} />
                    {d.isPrimary && <Badge variant="soft">หลัก</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">{d.lastCheckedAt ? `ตรวจล่าสุด ${fmtRelative(d.lastCheckedAt)}` : "ยังไม่เคยตรวจสอบ"}</span>
                  </div>
                  <p className={`mt-2 flex items-start gap-1.5 text-xs ${d.status === "failed" ? "text-destructive" : d.status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {d.status === "failed" ? <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden /> : d.status === "active" ? <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden /> : <Clock className="mt-px size-3.5 shrink-0" aria-hidden />}
                    <span>{STATUS_HELP[d.status]}</span>
                  </p>
                  {d.status !== "active" && (
                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg bg-muted/40 p-3 text-sm">
                      <p className="font-medium">เพิ่ม 2 record นี้ที่ผู้ให้บริการโดเมนของคุณ</p>
                      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
                        <DnsRecord step={1} type="TXT" purpose="ยืนยันว่าคุณเป็นเจ้าของโดเมน" name={d.dns?.txt.name ?? `_rentweb.${d.hostname}`} value={d.dns?.txt.value ?? d.verificationToken ?? ""} />
                        <DnsRecord step={2} type="CNAME" purpose="ชี้โดเมนมาที่หน้าร้านของคุณ" name={d.dns?.cname.name ?? d.hostname} value={d.dns?.cname.value ?? cnameTarget} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        บางผู้ให้บริการให้ใส่ชื่อเฉพาะส่วนหน้า (เช่น <span className="font-mono">_rentweb.www</span> และ <span className="font-mono">www</span>) · DNS อาจใช้เวลา 5 นาที – 24 ชั่วโมงในการอัปเดต จากนั้นกด “ตรวจสอบ DNS”
                      </p>
                      {d.lastError && (
                        <p role="status" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                          ผลตรวจล่าสุด: {d.lastError}
                        </p>
                      )}
                    </div>
                  )}
                  {d.status === "active" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      ยืนยันแล้ว {fmtRelative(d.verifiedAt)} · SSL: {d.sslStatus === "active" ? "พร้อมใช้งาน" : "กำลังออกใบรับรอง"}
                    </p>
                  )}
                  {canEdit && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {d.status !== "active" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={verifying && busyId === d.id}
                          onClick={async () => {
                            setBusyId(d.id);
                            await verify(slug, d.id);
                            setBusyId(null);
                          }}
                        >
                          {verifying && busyId === d.id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} ตรวจสอบ DNS
                        </Button>
                      )}
                      <ConfirmButton variant="ghost" size="sm" className="text-destructive hover:text-destructive" title={`ลบโดเมน ${d.hostname}?`} description="ลูกค้าจะเข้าเว็บผ่านโดเมนนี้ไม่ได้อีก" confirmLabel="ลบโดเมน" action={() => removeDomain(slug, d.id)}>
                        <Trash2 aria-hidden /> ลบ
                      </ConfirmButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
