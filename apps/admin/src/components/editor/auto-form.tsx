"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@rentweb/ui/components/select";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { cn } from "@rentweb/ui/lib/utils";
import { emptyValue, type FieldSpec, type ObjectSpec } from "@/lib/zod-introspect";

export type Uploader = (file: File) => Promise<string | null>;

interface Ctx {
  upload?: Uploader;
  disabled?: boolean;
  /** turns relative /uploads URLs into absolute ones for previews */
  resolveUrl?: (u: string) => string;
}

export function AutoForm({ spec, value, onChange, upload, disabled, resolveUrl }: { spec: ObjectSpec; value: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void } & Ctx) {
  const ctx: Ctx = { upload, disabled, resolveUrl };
  return (
    <div className="grid gap-5">
      {spec.fields.map((f) => (
        <FieldInput key={f.key} spec={f} value={value[f.key]} onChange={(v) => onChange({ ...value, [f.key]: v })} ctx={ctx} path={f.key} />
      ))}
    </div>
  );
}

function FieldInput({ spec, value, onChange, ctx, path }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void; ctx: Ctx; path: string }) {
  const id = `f-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  switch (spec.kind) {
    case "string":
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>
            {spec.label}
            {spec.optional && <span className="text-xs font-normal text-muted-foreground">(ไม่บังคับ)</span>}
          </Label>
          {spec.multiline ? (
            <Textarea id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={ctx.disabled} className="min-h-24" />
          ) : (
            <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(spec.optional && e.target.value === "" ? undefined : e.target.value)} disabled={ctx.disabled} />
          )}
        </div>
      );
    case "number": {
      const isRange = spec.min !== undefined && spec.max !== undefined && spec.max - spec.min <= 1;
      return (
        <div className="grid gap-1.5">
          <Label htmlFor={id}>
            {spec.label}
            {spec.min !== undefined && spec.max !== undefined && (
              <span className="text-xs font-normal text-muted-foreground">
                ({spec.min}–{spec.max})
              </span>
            )}
          </Label>
          {isRange ? (
            <div className="flex items-center gap-3">
              <input id={id} type="range" min={spec.min} max={spec.max} step={spec.step} value={Number(value ?? spec.defaultValue ?? spec.min ?? 0)} onChange={(e) => onChange(Number(e.target.value))} disabled={ctx.disabled} className="h-11 flex-1 accent-[var(--primary)]" />
              <span className="w-12 text-right text-sm tabular-nums">{Number(value ?? spec.defaultValue ?? 0).toFixed(2)}</span>
            </div>
          ) : (
            <Input id={id} type="number" inputMode="numeric" min={spec.min} max={spec.max} step={spec.step} value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} disabled={ctx.disabled} className="max-w-[12rem]" />
          )}
        </div>
      );
    }
    case "boolean":
      return (
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-2.5">
          <span className="text-sm font-medium">{spec.label}</span>
          <Switch checked={Boolean(value ?? spec.defaultValue ?? false)} onCheckedChange={(v) => onChange(v)} disabled={ctx.disabled} />
        </label>
      );
    case "enum": {
      const current = value ?? spec.defaultValue ?? spec.options[0];
      const useButtons = spec.options.length <= 5;
      return (
        <div className="grid gap-1.5">
          <Label>{spec.label}</Label>
          {useButtons ? (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={spec.label}>
              {spec.options.map((o) => (
                <button key={String(o)} type="button" role="radio" aria-checked={current === o} disabled={ctx.disabled} onClick={() => onChange(o)} className={cn("h-10 rounded-lg border px-3 text-sm font-medium transition-colors", current === o ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted")}>
                  {String(o)}
                </button>
              ))}
            </div>
          ) : (
            <Select value={String(current)} onValueChange={(v) => onChange(typeof spec.options[0] === "number" ? Number(v) : v)} disabled={ctx.disabled}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spec.options.map((o) => (
                  <SelectItem key={String(o)} value={String(o)}>
                    {String(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      );
    }
    case "object": {
      const obj = (value as Record<string, unknown> | undefined) ?? undefined;
      if (spec.optional && obj === undefined) {
        return (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3">
            <span className="text-sm font-medium text-muted-foreground">{spec.label}</span>
            <Button type="button" variant="outline" size="sm" disabled={ctx.disabled} onClick={() => onChange(emptyValue(spec))}>
              <Plus aria-hidden /> เพิ่ม
            </Button>
          </div>
        );
      }
      if (spec.isImage) return <ImageField spec={spec} value={obj ?? {}} onChange={onChange} ctx={ctx} path={path} />;
      return (
        <fieldset className="rounded-xl border p-4">
          <legend className="flex items-center gap-2 px-1 text-sm font-medium">
            {spec.label}
            {spec.optional && (
              <button type="button" className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => onChange(undefined)} disabled={ctx.disabled}>
                ลบ
              </button>
            )}
          </legend>
          <div className={cn("grid gap-4", spec.isLink && "sm:grid-cols-2")}>
            {spec.fields.map((f) => (
              <FieldInput key={f.key} spec={f} value={obj?.[f.key]} onChange={(v) => onChange({ ...(obj ?? {}), [f.key]: v })} ctx={ctx} path={`${path}.${f.key}`} />
            ))}
          </div>
        </fieldset>
      );
    }
    case "array":
      return <ArrayField spec={spec} value={(value as unknown[]) ?? []} onChange={onChange} ctx={ctx} path={path} />;
    case "json":
      return <JsonField label={spec.label} value={value} onChange={onChange} disabled={ctx.disabled} id={id} />;
  }
}

function ImageField({ spec, value, onChange, ctx, path }: { spec: ObjectSpec; value: Record<string, unknown>; onChange: (v: unknown) => void; ctx: Ctx; path: string }) {
  const [busy, setBusy] = React.useState(false);
  const url = (value.url as string) ?? "";
  const shown = url && ctx.resolveUrl ? ctx.resolveUrl(url) : url;
  const id = `f-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  async function pick(file?: File) {
    if (!file || !ctx.upload) return;
    setBusy(true);
    const u = await ctx.upload(file);
    setBusy(false);
    if (u) onChange({ ...value, url: u, alt: (value.alt as string) || file.name.replace(/\.[^.]+$/, "") });
  }
  return (
    <fieldset className="rounded-xl border p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-medium">
        {spec.label}
        {spec.optional && (
          <button type="button" className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={() => onChange(undefined)} disabled={ctx.disabled}>
            ลบ
          </button>
        )}
      </legend>
      <div className="flex gap-4">
        <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-3">
          <div className="flex gap-2">
            <Input id={`${id}-url`} value={url} onChange={(e) => onChange({ ...value, url: e.target.value })} placeholder="https://… หรืออัปโหลด" disabled={ctx.disabled} aria-label="URL รูปภาพ" />
            {ctx.upload && (
              <Button asChild variant="outline" size="icon" className="shrink-0 cursor-pointer" aria-label="อัปโหลดรูป">
                <label>
                  {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                  <input type="file" accept="image/*" className="sr-only" disabled={ctx.disabled || busy} onChange={(e) => pick(e.target.files?.[0])} />
                </label>
              </Button>
            )}
          </div>
          <Input id={`${id}-alt`} value={(value.alt as string) ?? ""} onChange={(e) => onChange({ ...value, alt: e.target.value })} placeholder="คำบรรยายรูป (alt) สำหรับ SEO และผู้พิการทางสายตา" disabled={ctx.disabled} aria-label="คำบรรยายรูป" />
          {spec.fields.some((f) => f.key === "caption") && <Input value={(value.caption as string) ?? ""} onChange={(e) => onChange({ ...value, caption: e.target.value || undefined })} placeholder="คำบรรยายใต้รูป (ไม่บังคับ)" disabled={ctx.disabled} aria-label="คำบรรยายใต้รูป" />}
        </div>
      </div>
    </fieldset>
  );
}

function ArrayField({ spec, value, onChange, ctx, path }: { spec: Extract<FieldSpec, { kind: "array" }>; value: unknown[]; onChange: (v: unknown) => void; ctx: Ctx; path: string }) {
  const items = Array.isArray(value) ? value : [];
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, k) => k !== i));
  const add = () => onChange([...items, emptyValue(spec.item)]);
  const primitive = spec.item.kind === "string" || spec.item.kind === "number" || spec.item.kind === "enum";
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label>
          {spec.label} <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
        </Label>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={ctx.disabled}>
          <Plus aria-hidden /> เพิ่มรายการ
        </Button>
      </div>
      {items.length === 0 && <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">ยังไม่มีรายการ</p>}
      <ul className="grid gap-2">
        {items.map((item, i) => (
          <li key={i} className={cn("flex gap-2", primitive ? "items-center" : "items-start rounded-xl border bg-muted/30 p-3")}>
            <div className="flex shrink-0 flex-col">
              <button type="button" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0 || ctx.disabled} aria-label="เลื่อนขึ้น">
                <ChevronUp className="size-4" aria-hidden />
              </button>
              <button type="button" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === items.length - 1 || ctx.disabled} aria-label="เลื่อนลง">
                <ChevronDown className="size-4" aria-hidden />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              {primitive ? (
                <FieldInput spec={{ ...spec.item, label: `${spec.label} ${i + 1}` }} value={item} onChange={(v) => onChange(items.map((x, k) => (k === i ? v : x)))} ctx={ctx} path={`${path}.${i}`} />
              ) : spec.item.kind === "object" ? (
                <div className={cn("grid gap-3", spec.item.fields.length > 2 && "sm:grid-cols-2")}>
                  {spec.item.fields.map((f) => (
                    <div key={f.key} className={cn(f.kind === "string" && f.multiline && "sm:col-span-2")}>
                      <FieldInput spec={f} value={(item as Record<string, unknown>)?.[f.key]} onChange={(v) => onChange(items.map((x, k) => (k === i ? { ...(x as Record<string, unknown>), [f.key]: v } : x)))} ctx={ctx} path={`${path}.${i}.${f.key}`} />
                    </div>
                  ))}
                </div>
              ) : (
                <FieldInput spec={spec.item} value={item} onChange={(v) => onChange(items.map((x, k) => (k === i ? v : x)))} ctx={ctx} path={`${path}.${i}`} />
              )}
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(i)} disabled={ctx.disabled} aria-label="ลบรายการ">
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JsonField({ label, value, onChange, disabled, id }: { label: string; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; id: string }) {
  const [text, setText] = React.useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    setText(JSON.stringify(value ?? null, null, 2));
  }, [value]);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label} <span className="text-xs font-normal text-muted-foreground">(JSON)</span>
      </Label>
      <Textarea
        id={id}
        value={text}
        disabled={disabled}
        spellCheck={false}
        className="min-h-32 font-mono text-xs"
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError(null);
          } catch {
            setError("JSON ไม่ถูกต้อง");
          }
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
