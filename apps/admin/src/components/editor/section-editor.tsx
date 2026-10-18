"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, Globe, Loader2, MoreHorizontal, Plus, Save, Search, Settings2, Trash2, Upload } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@rentweb/ui/components/dropdown-menu";
import { Input } from "@rentweb/ui/components/input";
import { Label } from "@rentweb/ui/components/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@rentweb/ui/components/sheet";
import { Switch } from "@rentweb/ui/components/switch";
import { Textarea } from "@rentweb/ui/components/textarea";
import { toast } from "@rentweb/ui/components/sonner";
import { cn } from "@rentweb/ui/lib/utils";
import { SECTION_DEFS } from "@rentweb/storefront/definitions";
import type { SectionJson, SeoJson } from "@rentweb/db";
import { describeSchema, type ObjectSpec } from "@/lib/zod-introspect";
import { AutoForm } from "./auto-form";
import { createPagePreviewLink, deletePage, publishPage, savePageDraft, unpublishPage } from "@/app/t/[slug]/pages/actions";
import { uploadSectionImage } from "@/app/t/[slug]/media/actions";
import { MEDIA_MAX_BYTES, tooLargeMessage } from "@/app/t/[slug]/media/limits";
import { useReturnFocus } from "@/lib/use-return-focus";

const CATEGORY_TH: Record<string, string> = {
  hero: "ส่วนเปิดหน้า",
  content: "เนื้อหา",
  media: "สื่อ",
  social: "ความน่าเชื่อถือ",
  cta: "ชวนให้ลงมือ",
  commerce: "ร้านค้า",
  booking: "จองคิว",
  topup: "เติมเกม",
  restaurant: "ร้านอาหาร",
  clinic: "คลินิก",
  rental: "ห้องพัก",
  events: "อีเวนต์",
  layout: "เลย์เอาต์",
};
const CATEGORY_ORDER = ["hero", "content", "media", "social", "cta", "commerce", "booking", "topup", "restaurant", "clinic", "rental", "events", "layout"];

export interface PageMeta {
  title: string;
  slug: string;
  showInNav: boolean;
  seo: SeoJson;
}

export interface SectionEditorProps {
  tenantSlug: string;
  pageId: string;
  kind: string;
  status: string;
  publishedAt: string | null;
  initialSections: SectionJson[];
  initialMeta: PageMeta;
  /** slug the storefront serves right now (differs from initialMeta.slug while a rename waits for publish) */
  liveSlug: string;
  /** published page whose sections or meta differ from what the storefront shows */
  hasUnpublishedChanges: boolean;
  enabledModules: string[];
  storefrontUrl: string;
  /** staff+: may save drafts and upload section images */
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

function useIsDesktop() {
  const [desktop, setDesktop] = React.useState(true);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function SectionEditor(props: SectionEditorProps) {
  const { tenantSlug, pageId, kind, storefrontUrl, enabledModules } = props;
  const router = useRouter();
  const desktop = useIsDesktop();
  const [sections, setSections] = React.useState<SectionJson[]>(props.initialSections);
  const [meta, setMeta] = React.useState<PageMeta>(props.initialMeta);
  const [status, setStatus] = React.useState(props.status);
  const [saved, setSaved] = React.useState({ sections: props.initialSections, meta: props.initialMeta });
  const [selected, setSelected] = React.useState<string | null>(props.initialSections[0]?.id ?? null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [seoOpen, setSeoOpen] = React.useState(false);
  const [pending, setPending] = React.useState<"save" | "publish" | null>(null);
  const [query, setQuery] = React.useState("");
  const [liveSlug, setLiveSlug] = React.useState(props.liveSlug);
  const [unpublished, setUnpublished] = React.useState(props.hasUnpublishedChanges);
  const [previewing, setPreviewing] = React.useState(false);
  // RESPONSIVE_B2-11: these dialogs are controlled (no DialogTrigger) - give focus back to whatever opened them
  const addFocus = useReturnFocus();
  const seoFocus = useReturnFocus();
  const sheetFocus = useReturnFocus();

  const dirty = JSON.stringify({ sections, meta }) !== JSON.stringify(saved);

  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const specs = React.useMemo(() => {
    const out: Record<string, ObjectSpec> = {};
    for (const [type, def] of Object.entries(SECTION_DEFS)) {
      const s = describeSchema(def.schema, "", def.name.th);
      if (s.kind === "object") out[type] = s;
    }
    return out;
  }, []);

  const available = React.useMemo(() => {
    const groups: Record<string, Array<(typeof SECTION_DEFS)[string]>> = {};
    for (const def of Object.values(SECTION_DEFS)) {
      if (def.module && !enabledModules.includes(def.module)) continue;
      if (query && !`${def.name.th} ${def.name.en} ${def.type}`.toLowerCase().includes(query.toLowerCase())) continue;
      (groups[def.category] ??= []).push(def);
    }
    return CATEGORY_ORDER.filter((c) => groups[c]?.length).map((c) => ({ key: c, label: CATEGORY_TH[c] ?? c, defs: groups[c]! }));
  }, [enabledModules, query]);

  // ADMIN_B2-14: section images go to the media library with the same role as saving a draft (staff+); every
  // failure (size, type, permission, network) is a toast instead of a silent no-op
  const upload = React.useCallback(
    async (file: File) => {
      if (file.size > MEDIA_MAX_BYTES) {
        toast.error(tooLargeMessage(file.name, file.size));
        return null;
      }
      try {
        const fd = new FormData();
        fd.set("file", file);
        const r = await uploadSectionImage(tenantSlug, fd);
        if (!r.ok) {
          toast.error(r.error);
          return null;
        }
        return r.url ?? null;
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "อัปโหลดรูปไม่สำเร็จ");
        return null;
      }
    },
    [tenantSlug],
  );
  const resolveUrl = React.useCallback((u: string) => (u.startsWith("/") ? `${storefrontUrl}${u}` : u), [storefrontUrl]);

  function addSection(type: string) {
    const def = SECTION_DEFS[type];
    if (!def) return;
    const props = def.schema.parse({ ...(def.defaults as object) }) as Record<string, unknown>;
    const s: SectionJson = { id: newId(), type, props };
    setSections((list) => {
      const idx = selected ? list.findIndex((x) => x.id === selected) : -1;
      const next = [...list];
      next.splice(idx >= 0 ? idx + 1 : next.length, 0, s);
      return next;
    });
    setSelected(s.id);
    setAddOpen(false);
  }
  const move = (id: string, d: -1 | 1) =>
    setSections((list) => {
      const i = list.findIndex((s) => s.id === id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const toggleHidden = (id: string) => setSections((list) => list.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)));
  const remove = (id: string) => {
    setSections((list) => list.filter((s) => s.id !== id));
    if (selected === id) setSelected(null);
  };
  const updateProps = (id: string, props: Record<string, unknown>) => setSections((list) => list.map((s) => (s.id === id ? { ...s, props } : s)));

  async function doSave(): Promise<boolean> {
    setPending("save");
    try {
      const r = await savePageDraft(tenantSlug, pageId, { sections, meta });
      if (!r.ok) {
        toast.error(r.error);
        return false;
      }
      const data = r.data as { slug?: string; pending?: boolean } | undefined;
      const newSlug = data?.slug;
      const savedMeta = newSlug && newSlug !== meta.slug ? { ...meta, slug: newSlug } : meta;
      if (savedMeta !== meta) setMeta(savedMeta);
      setSaved({ sections, meta: savedMeta });
      if (status !== "published" && newSlug) setLiveSlug(newSlug);
      setUnpublished(!!data?.pending);
      toast.success(r.message ?? "บันทึกแล้ว");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setPending(null);
    }
  }
  /**
   * ADMIN_B2-02: preview the DRAFT. Unsaved edits are saved as a draft first (never published), then the storefront's
   * preview route is opened with a short-lived signed token for this page.
   */
  async function doPreview() {
    // open the tab inside the click (popup blockers), point it at the signed URL once we have it
    const win = window.open("", "_blank");
    setPreviewing(true);
    try {
      if (dirty) {
        if (!props.canEdit) toast.info("ตัวอย่างแสดงฉบับร่างที่บันทึกไว้ล่าสุด (คุณไม่มีสิทธิ์บันทึกการแก้ไข)");
        else if (!(await doSave())) {
          win?.close();
          return;
        }
      }
      const r = await createPagePreviewLink(tenantSlug, pageId);
      if (!r.ok) {
        win?.close();
        toast.error(r.error);
        return;
      }
      const url = (r.data as { url: string }).url;
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.open(url, "_blank", "noopener");
      }
    } catch (e) {
      win?.close();
      toast.error(e instanceof Error ? e.message : "เปิดตัวอย่างไม่สำเร็จ");
    } finally {
      setPreviewing(false);
    }
  }
  async function doPublish() {
    setPending("publish");
    try {
      const r = await publishPage(tenantSlug, pageId, { sections, meta });
      if (!r.ok) return toast.error(r.error);
      setSaved({ sections, meta });
      setStatus("published");
      setLiveSlug(meta.slug);
      setUnpublished(false);
      toast.success(r.message ?? "เผยแพร่แล้ว");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เผยแพร่ไม่สำเร็จ");
    } finally {
      setPending(null);
    }
  }
  async function doUnpublish() {
    const r = await unpublishPage(tenantSlug, pageId);
    if (!r.ok) return toast.error(r.error);
    setStatus("draft");
    toast.success(r.message ?? "ซ่อนแล้ว");
  }
  async function doDelete() {
    if (!confirm("ลบหน้านี้ถาวร? การกระทำนี้ย้อนกลับไม่ได้")) return;
    try {
      const r = await deletePage(tenantSlug, pageId);
      if (r && !r.ok) toast.error(r.error);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) throw e;
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  const current = sections.find((s) => s.id === selected) ?? null;
  const currentDef = current ? SECTION_DEFS[current.type] : null;
  const currentSpec = current ? specs[current.type] : null;
  const liveHref = `${storefrontUrl}${kind === "home" ? "/" : `/${liveSlug}`}`;
  const slugPending = kind !== "home" && status === "published" && meta.slug !== liveSlug;

  const propsPanel = current && (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{CATEGORY_TH[currentDef?.category ?? ""] ?? currentDef?.category}</p>
          <h3 className="font-heading text-lg font-semibold">{currentDef?.name.th ?? current.type}</h3>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggleHidden(current.id)} aria-label={current.hidden ? "แสดงเซ็กชัน" : "ซ่อนเซ็กชัน"}>
            {current.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => remove(current.id)} aria-label="ลบเซ็กชัน">
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {currentSpec ? (
        <AutoForm spec={currentSpec} value={current.props} onChange={(v) => updateProps(current.id, v)} upload={props.canEdit ? upload : undefined} resolveUrl={resolveUrl} />
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">ไม่พบนิยามของเซ็กชันชนิด “{current.type}” — เซ็กชันนี้จะถูกซ่อนจากหน้าร้าน</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="กลับไปรายการหน้า">
            <Link href={`/t/${tenantSlug}/pages`}>
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} className="min-w-0 max-w-full bg-transparent font-heading text-xl font-semibold tracking-tight outline-none focus:underline sm:text-2xl" aria-label="ชื่อหน้า" />
              <Badge variant={status === "published" ? "success" : "muted"}>{status === "published" ? "เผยแพร่แล้ว" : "ฉบับร่าง"}</Badge>
              {status === "published" && unpublished && !dirty && (
                <Badge variant="outline" className="hidden border-amber-300 text-amber-700 sm:inline-flex dark:text-amber-300">
                  มีการแก้ไขที่ยังไม่เผยแพร่
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {storefrontUrl.replace(/^https?:\/\//, "")}
              {kind === "home" ? "/" : `/${meta.slug}`}
              {slugPending && <span className="ml-2">(หน้าร้านยังใช้ /{liveSlug} จนกว่าจะเผยแพร่)</span>}
              {dirty && <span className="ml-2 text-amber-600">• ยังไม่บันทึก</span>}
              {!dirty && status === "published" && unpublished && <span className="ml-2 text-amber-600 sm:hidden">• ยังไม่เผยแพร่</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSeoOpen(true)}>
            <Settings2 aria-hidden /> ตั้งค่าหน้า & SEO
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={doPreview} disabled={previewing || !!pending} title="เปิดฉบับร่างในแท็บใหม่ (ยังไม่เผยแพร่)">
            {previewing ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />} ดูตัวอย่าง
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={doSave} disabled={!props.canEdit || !dirty || !!pending}>
            {pending === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกร่าง
          </Button>
          {props.canPublish && (
            <Button type="button" size="sm" onClick={doPublish} disabled={!!pending}>
              {pending === "publish" ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />} เผยแพร่
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="เพิ่มเติม">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {status === "published" && (
                <DropdownMenuItem asChild>
                  <a href={liveHref} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden /> เปิดหน้าที่เผยแพร่อยู่
                  </a>
                </DropdownMenuItem>
              )}
              {kind !== "home" && status === "published" && props.canPublish && <DropdownMenuItem onClick={doUnpublish}>ซ่อนจากหน้าร้าน (กลับเป็นร่าง)</DropdownMenuItem>}
              {kind !== "home" && props.canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={doDelete}>
                    <Trash2 aria-hidden /> ลบหน้านี้
                  </DropdownMenuItem>
                </>
              )}
              {kind === "home" && <DropdownMenuItem disabled>หน้าแรกไม่สามารถลบหรือซ่อนได้</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Section list */}
        <div className="card gap-0 py-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-medium">
              เซ็กชัน <span className="text-muted-foreground">({sections.length})</span>
            </p>
            <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
              <Plus aria-hidden /> เพิ่มเซ็กชัน
            </Button>
          </div>
          {sections.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">หน้านี้ยังว่างอยู่ — เริ่มด้วยการเพิ่มเซ็กชันแรก</p>
              <Button type="button" variant="outline" className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden /> เพิ่มเซ็กชัน
              </Button>
            </div>
          ) : (
            <ol className="divide-y">
              {sections.map((s, i) => {
                const def = SECTION_DEFS[s.type];
                const active = s.id === selected;
                const title = (s.props.heading as string) || (s.props.text as string) || (s.props.title as string) || "";
                return (
                  <li key={s.id} className={cn("flex items-stretch gap-1 px-2 py-1.5 transition-colors", active && "bg-primary-soft/60")}>
                    <div className="flex flex-col justify-center">
                      <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="เลื่อนขึ้น">
                        <ChevronUp className="size-4" aria-hidden />
                      </button>
                      <button type="button" onClick={() => move(s.id, 1)} disabled={i === sections.length - 1} className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="เลื่อนลง">
                        <ChevronDown className="size-4" aria-hidden />
                      </button>
                    </div>
                    <button type="button" onClick={() => setSelected(s.id)} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg px-2 text-left hover:bg-muted/60" aria-current={active ? "true" : undefined}>
                      <span className={cn("flex items-center gap-2 text-sm font-medium", s.hidden && "text-muted-foreground line-through")}>
                        <span className="grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">{i + 1}</span>
                        <span className="truncate">{def?.name.th ?? s.type}</span>
                        {s.hidden && <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="ซ่อนอยู่" />}
                      </span>
                      {title && <span className="truncate pl-7 text-xs text-muted-foreground">{title}</span>}
                    </button>
                    <div className="flex items-center">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => toggleHidden(s.id)} aria-label={s.hidden ? "แสดง" : "ซ่อน"} className="text-muted-foreground">
                        {s.hidden ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Props panel (desktop inline) */}
        {desktop && (
          <div className="card min-h-[24rem] py-0">
            {current ? (
              <div className="p-5">{propsPanel}</div>
            ) : (
              <div className="flex h-full min-h-[24rem] flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
                <Settings2 className="mb-3 size-6" aria-hidden />
                เลือกเซ็กชันทางซ้ายเพื่อแก้ไขเนื้อหา
              </div>
            )}
          </div>
        )}
      </div>

      {/* Props panel (mobile sheet) */}
      {!desktop && (
        <Sheet open={!!current} onOpenChange={(o) => !o && setSelected(null)}>
          <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto p-5 pt-6" {...sheetFocus}>
            <SheetHeader className="p-0 pb-3">
              <SheetTitle className="sr-only">แก้ไขเซ็กชัน</SheetTitle>
            </SheetHeader>
            {propsPanel}
            <div className="sticky bottom-0 -mx-5 mt-4 flex gap-2 border-t bg-background px-5 py-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setSelected(null)}>
                เสร็จ
              </Button>
              <Button type="button" className="flex-1" onClick={doSave} disabled={!props.canEdit || !dirty || !!pending}>
                {pending === "save" ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} บันทึกร่าง
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Add section dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" {...addFocus}>
          <DialogHeader>
            <DialogTitle>เพิ่มเซ็กชัน</DialogTitle>
            <DialogDescription>เลือกบล็อกที่ต้องการ — แสดงเฉพาะเซ็กชันของโมดูลที่ร้านคุณเปิดใช้</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาเซ็กชัน…" className="pl-9" aria-label="ค้นหาเซ็กชัน" />
          </div>
          <div className="space-y-5">
            {available.map((g) => (
              <div key={g.key}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{g.label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.defs.map((def) => (
                    <button key={def.type} type="button" onClick={() => addSection(def.type)} className="flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Plus className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{def.name.th}</span>
                        <span className="block truncate text-xs text-muted-foreground">{def.description?.th ?? def.type}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {available.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบเซ็กชันที่ค้นหา</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Meta / SEO dialog */}
      <Dialog open={seoOpen} onOpenChange={setSeoOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto" {...seoFocus}>
          <DialogHeader>
            <DialogTitle>ตั้งค่าหน้าและ SEO</DialogTitle>
            <DialogDescription>ชื่อ ที่อยู่ และข้อมูลที่แสดงบน Google และเมื่อแชร์ลิงก์</DialogDescription>
          </DialogHeader>
          {status === "published" && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              ค่าที่แก้ที่นี่ถูกบันทึกเป็นฉบับร่าง หน้าร้านจะเปลี่ยนเมื่อกด “เผยแพร่”{props.canPublish ? "" : " (ผู้จัดการขึ้นไปเป็นผู้เผยแพร่)"}
            </p>
          )}
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="meta-title">ชื่อหน้า</Label>
              <Input id="meta-title" value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} />
            </div>
            {kind !== "home" && (
              <div className="grid gap-1.5">
                <Label htmlFor="meta-slug">ที่อยู่หน้า (slug)</Label>
                <div className="flex items-center overflow-hidden rounded-md border border-input">
                  <span className="hidden border-r bg-muted px-3 text-sm text-muted-foreground sm:block">/</span>
                  <input id="meta-slug" value={meta.slug} onChange={(e) => setMeta((m) => ({ ...m, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-") }))} className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" />
                </div>
              </div>
            )}
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-2.5">
              <span>
                <span className="block text-sm font-medium">แสดงในเมนูนำทางอัตโนมัติ</span>
                <span className="block text-xs text-muted-foreground">ใช้เมื่อยังไม่ได้ตั้งเมนูเอง</span>
              </span>
              <Switch checked={meta.showInNav} onCheckedChange={(v) => setMeta((m) => ({ ...m, showInNav: v }))} />
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="seo-title">SEO title</Label>
              <Input id="seo-title" value={meta.seo.title ?? ""} onChange={(e) => setMeta((m) => ({ ...m, seo: { ...m.seo, title: e.target.value || undefined } }))} maxLength={120} placeholder={meta.title} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seo-desc">คำอธิบาย (meta description)</Label>
              <Textarea id="seo-desc" value={meta.seo.description ?? ""} onChange={(e) => setMeta((m) => ({ ...m, seo: { ...m.seo, description: e.target.value || undefined } }))} maxLength={320} className="min-h-20" />
              <p className="text-xs text-muted-foreground">{(meta.seo.description ?? "").length}/160 ตัวอักษรที่แนะนำ</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="seo-og">รูปเมื่อแชร์ (OG image URL)</Label>
              <Input id="seo-og" value={meta.seo.ogImage ?? ""} onChange={(e) => setMeta((m) => ({ ...m, seo: { ...m.seo, ogImage: e.target.value || undefined } }))} placeholder="https://…" />
            </div>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-2.5">
              <span>
                <span className="block text-sm font-medium">ไม่ให้ Google จัดทำดัชนี (noindex)</span>
                <span className="block text-xs text-muted-foreground">ใช้กับหน้าภายในหรือหน้าทดสอบ</span>
              </span>
              <Switch checked={!!meta.seo.noindex} onCheckedChange={(v) => setMeta((m) => ({ ...m, seo: { ...m.seo, noindex: v || undefined } }))} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setSeoOpen(false)}>
                ปิด
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  if (await doSave()) setSeoOpen(false);
                }}
                disabled={!props.canEdit || !!pending}
              >
                <Globe aria-hidden /> บันทึกร่าง
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
