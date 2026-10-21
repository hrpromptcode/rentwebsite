"use client";

import * as React from "react";
import {
  BreathingOrb,
  CardStack3D,
  CurvedGallery,
  FloatingObjects,
  ImageSilk,
  OceanSurface,
  ParticleMorph,
  ScenePoster,
  ShaderBackdrop,
  StageLights,
  SteamRise,
  Ticket3D,
  WormholeTunnel,
  type FloatingSet,
  type ParticleShape,
  type PosterVariant,
  type ShaderBackdropVariant,
} from "@rentweb/ui/three";

export interface LabPreset {
  key: string;
  name: string;
  defaultMode: "light" | "dark";
  light: Record<string, string>;
  dark: Record<string, string>;
}

const u = (id: string, w = 1200) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const GALLERY = [
  { id: "1445205170230-053b83016050", title: "Siam Atelier", subtitle: "แฟชั่น · ร้านค้า", tag: "SHOP" },
  { id: "1550745165-9bc0b252726f", title: "GameHub", subtitle: "เติมเกม · ระบบออโต้", tag: "TOPUP" },
  { id: "1616394584738-fc6e612e71b9", title: "Lumière Clinic", subtitle: "คลินิกความงาม · จองคิว", tag: "CLINIC" },
  { id: "1414235077428-338989a2e8c0", title: "บ้านริม", subtitle: "ร้านอาหาร · สั่งผ่าน QR", tag: "RESTAURANT" },
  { id: "1600334129128-685c5582fd35", title: "สบาย สบาย", subtitle: "สปา · นวดไทย", tag: "SPA" },
  { id: "1497366216548-37526070297c", title: "Northstar Studio", subtitle: "เอเจนซี · ผลงาน", tag: "AGENCY" },
  { id: "1551024601-bec78aea704b", title: "Sugar Puff", subtitle: "เบเกอรี · พรีออเดอร์", tag: "CAFE" },
  { id: "1506929562872-bb421503ef21", title: "บ้านทะเล เขาหลัก", subtitle: "รีสอร์ต · จองห้องพัก", tag: "HOTEL" },
  { id: "1501281668745-f7f57925c3b4", title: "Maker Yard Bangkok", subtitle: "อีเวนต์ · ขายบัตร", tag: "EVENTS" },
  { id: "1515372039744-b8f02a3ae446", title: "Sala Flow", subtitle: "โยคะ · คลาสเรียน", tag: "STUDIO" },
].map((g) => ({ image: u(g.id, 1000), title: g.title, subtitle: g.subtitle, tag: g.tag, href: `#open-${g.tag.toLowerCase()}` }));

const BAG = "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z M3 6h18 M16 10a4 4 0 0 1-8 0";
const SHAPES: ParticleShape[] = ["crystal-flower", "star", "globe", { text: "RentWeb" }, { svgPath: BAG }, "knot", "torus", "wave"];

const STEPS = [
  { kicker: "Template", title: "เลือกเทมเพลต", body: "10 ธุรกิจ 10 บุคลิก เริ่มจากแบบที่ใกล้ร้านคุณที่สุด", image: u("1445205170230-053b83016050", 1024) },
  { kicker: "Brand", title: "ใส่โลโก้ สี ฟอนต์", body: "ทุกฉาก 3D เปลี่ยนสีตามธีมของคุณทันที", image: u("1497366216548-37526070297c", 1024) },
  { kicker: "Catalog", title: "เพิ่มสินค้า/บริการ", body: "สินค้า คอร์ส ห้องพัก บัตรอีเวนต์ ครบในที่เดียว", image: u("1551024601-bec78aea704b", 1024) },
  { kicker: "Payments", title: "เชื่อม PromptPay + LINE", body: "รับชำระด้วยสลิป แจ้งเตือนผ่าน LINE", image: "" },
  { kicker: "Launch", title: "เปิดเว็บ รับลูกค้าได้เลย", body: "ออนไลน์ใน 5 นาที", image: u("1501281668745-f7f57925c3b4", 1024) },
];

const SETS: FloatingSet[] = ["fashion", "gaming", "clinic", "food", "spa", "corporate", "pastry", "yoga", "resort", "events", "abstract"];
const BACKDROPS: ShaderBackdropVariant[] = ["aurora", "silk", "mesh", "grain-gradient", "ember", "caustics"];
const POSTERS: PosterVariant[] = ["aurora", "silk", "mesh", "ocean", "stage", "ember", "orb", "grid", "plain"];

function applyTheme(p: LabPreset, mode: "light" | "dark") {
  const html = document.documentElement;
  const vars = mode === "dark" ? { ...p.light, ...p.dark } : p.light;
  for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v);
  html.classList.toggle("dark", mode === "dark");
  html.setAttribute("data-preset", p.key);
  document.body.style.background = "var(--background)";
  document.body.style.color = "var(--foreground)";
  window.dispatchEvent(new Event("rw:theme"));
}

function FpsMeter() {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    let raf = 0;
    let n = 0;
    let t0 = performance.now();
    const loop = (t: number) => {
      n++;
      if (t - t0 >= 1000) {
        const fps = Math.round((n * 1000) / (t - t0));
        (window as unknown as { __rwFps: number }).__rwFps = fps;
        if (ref.current) ref.current.textContent = `${fps} fps`;
        n = 0;
        t0 = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={ref} className="font-mono text-xs tabular-nums">— fps</span>;
}

function Plate({ id, title, note, children, className = "h-[70svh] min-h-[420px]", bare }: { id: string; title: string; note?: string; children: React.ReactNode; className?: string; bare?: boolean }) {
  return (
    <section id={id} className="border-t border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] px-4 py-10 md:px-10">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
        {note ? <p className="max-w-xl text-sm leading-relaxed opacity-70">{note}</p> : null}
      </header>
      {bare ? children : <div className={`relative overflow-hidden rounded-[calc(var(--radius)*1.5)] bg-[var(--surface)] ${className}`}>{children}</div>}
    </section>
  );
}

function MorphControlled() {
  const [i, setI] = React.useState(0);
  const words = ["ร้านค้า", "คลินิก", "อีเวนต์", "RentWeb"];
  const shapes: ParticleShape[] = [{ svgPath: BAG }, "crystal-flower", "star", { text: "RentWeb" }];
  return (
    <>
      <ParticleMorph shapes={shapes} active={i} colors={["primary", "accent"]} className="absolute inset-0" />
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2">
        {words.map((w, k) => (
          <button key={w} type="button" onClick={() => setI(k)} data-active={k === i} className="h-11 rounded-full border border-[var(--border)] bg-[var(--background)] px-4 text-sm data-[active=true]:bg-[var(--primary)] data-[active=true]:text-[var(--primary-foreground)]">
            {w}
          </button>
        ))}
      </div>
    </>
  );
}

export function Lab3D({ presets }: { presets: LabPreset[] }) {
  const [preset, setPreset] = React.useState(() => presets.find((p) => p.key === "midnight") ?? presets[0]!);
  const [mode, setMode] = React.useState<"light" | "dark">(preset.defaultMode);
  const [scene3d, setScene3d] = React.useState<"auto" | "lite" | "off">("auto");

  React.useEffect(() => applyTheme(preset, mode), [preset, mode]);
  React.useEffect(() => {
    document.documentElement.setAttribute("data-scene3d", scene3d);
  }, [scene3d]);

  return (
    <main className="min-h-dvh bg-[var(--background)] pb-32 text-[var(--foreground)]">
      <div className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] bg-[color-mix(in_oklab,var(--background)_80%,transparent)] px-4 py-2 backdrop-blur md:px-10">
        <strong className="mr-2 text-sm">3D kit lab</strong>
        <select
          aria-label="preset"
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
          value={preset.key}
          onChange={(e) => {
            const p = presets.find((x) => x.key === e.target.value)!;
            setPreset(p);
            setMode(p.defaultMode);
          }}
        >
          {presets.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key} — {p.name}
            </option>
          ))}
        </select>
        <button type="button" aria-label="mode" className="h-9 rounded-md border border-[var(--border)] px-3 text-sm" onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}>
          {mode}
        </button>
        <select aria-label="scene3d" className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm" value={scene3d} onChange={(e) => setScene3d(e.target.value as "auto")}>
          <option value="auto">scene3d: auto</option>
          <option value="lite">scene3d: lite</option>
          <option value="off">scene3d: off (posters)</option>
        </select>
        <span className="ml-auto">
          <FpsMeter />
        </span>
      </div>

      <section className="px-4 pb-6 pt-12 md:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">packages/ui/src/three</p>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">3D kit</h1>
        <p className="mt-4 max-w-2xl leading-relaxed opacity-70">ทุกคอมโพเนนต์อ่านสีจากธีม (เปลี่ยน preset ด้านบนแล้วดูฉากเปลี่ยนสีทันที) มีโปสเตอร์สำรองเมื่อไม่มี WebGL / ลดการเคลื่อนไหว</p>
      </section>

      <Plate id="gallery" title="CurvedGallery · grid floor" note="ลาก / เลื่อน / วางเมาส์บนการ์ด / Tab ผ่านลิงก์ (วงแหวนหมุนตาม)" bare>
        <CurvedGallery items={GALLERY} ariaLabel="เทมเพลตทั้งหมด" />
      </Plate>
      <Plate id="gallery-reflect" title="CurvedGallery · reflect · 2 rows · no autoplay (snap)" bare>
        <CurvedGallery items={GALLERY} rows={2} floor="reflect" autoplay={0} height="tall" />
      </Plate>

      <Plate id="morph" title="ParticleMorph · auto" note="crystal-flower → star → globe → text → svg → knot → torus → wave" className="h-[80svh] min-h-[480px]">
        <ParticleMorph shapes={SHAPES} auto={{ interval: 3.5 }} className="absolute inset-0" />
      </Plate>
      <Plate id="morph-controlled" title="ParticleMorph · controlled" className="h-[70svh] min-h-[420px]">
        <MorphControlled />
      </Plate>

      {SETS.map((s) => (
        <Plate key={s} id={`objects-${s}`} title={`FloatingObjects · ${s}`} note={s === "pastry" ? "interactive=poke (คลิกที่ขนม)" : undefined} className="h-[60svh] min-h-[380px]">
          <FloatingObjects set={s} interactive={s === "pastry" ? "poke" : s === "gaming" ? "drag" : "none"} />
        </Plate>
      ))}

      <Plate id="tunnel" title="WormholeTunnel" note="เลื่อนผ่านช่วงนี้ — กล้องบินผ่านอุโมงค์" bare>
        <WormholeTunnel steps={STEPS} length="normal" ariaLabel="ขั้นตอนเปิดร้าน" />
      </Plate>

      <Plate id="ocean" title="OceanSurface · ocean" className="h-[70svh] min-h-[420px]">
        <OceanSurface mode="ocean" />
      </Plate>
      <Plate id="pool" title="OceanSurface · pool" className="h-[60svh] min-h-[380px]">
        <OceanSurface mode="pool" />
      </Plate>
      <Plate id="ripple" title="OceanSurface · ripple (photo)" note="ขยับเมาส์ / แตะ เพื่อทำระลอกน้ำ" className="h-[60svh] min-h-[380px]">
        <OceanSurface mode="ripple" image={u("1600334129128-685c5582fd35", 1600)} />
      </Plate>

      <Plate id="stage" title="StageLights · crowd" className="h-[70svh] min-h-[420px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={u("1501281668745-f7f57925c3b4", 1600)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <StageLights crowd />
      </Plate>

      <Plate id="ticket" title="Ticket3D" note="ลากเพื่อหมุนตั๋ว" className="h-[60svh] min-h-[380px]">
        <Ticket3D title="Maker Yard Night Market" date="ส. 15 พ.ย. 2026 · 18:00" venue="คลองสาน กรุงเทพฯ" price="฿350" code="MYB-2611-0042" />
      </Plate>

      <Plate id="cards-fan" title="CardStack3D · fan" className="h-[60svh] min-h-[420px]">
        <CardStack3D items={GALLERY.slice(0, 5).map((g) => ({ image: g.image, title: g.title, badge: g.tag, href: g.href }))} layout="fan" />
      </Plate>
      <Plate id="cards-orbit" title="CardStack3D · orbit · synthgrid" className="h-[70svh] min-h-[460px]">
        <CardStack3D items={GALLERY.slice(0, 7).map((g) => ({ image: g.image, title: g.title, badge: g.tag, href: g.href }))} layout="orbit" floor="synthgrid" />
      </Plate>
      <Plate id="cards-stack" title="CardStack3D · stack" className="h-[60svh] min-h-[420px]">
        <CardStack3D items={GALLERY.slice(3, 8).map((g) => ({ image: g.image, title: g.title, badge: g.tag, href: g.href }))} layout="stack" />
      </Plate>

      <Plate id="breath" title="BreathingOrb" className="h-[70svh] min-h-[460px]">
        <BreathingOrb />
      </Plate>

      <Plate id="steam" title="SteamRise · over a food photo" className="h-[60svh] min-h-[380px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={u("1504674900247-0877df9cc836", 1600)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <SteamRise />
      </Plate>

      <Plate id="silk" title="ImageSilk" className="h-[80svh] min-h-[520px]">
        <ImageSilk image={u("1515886657613-9f3515b0c78f", 1400)} alt="ลุคบุ๊กคอลเลกชันใหม่" />
      </Plate>

      {BACKDROPS.map((v) => (
        <Plate key={v} id={`backdrop-${v}`} title={`ShaderBackdrop · ${v}`} className="h-[46svh] min-h-[320px]">
          <ShaderBackdrop variant={v} />
          <div className="pointer-events-none relative z-10 flex h-full items-end p-6 md:p-10">
            <p className="text-4xl font-semibold leading-[1.25] md:text-6xl">ให้วันนี้เป็นวันที่คุณได้พัก</p>
          </div>
        </Plate>
      ))}

      <Plate id="posters" title="ScenePoster (server-safe fallbacks)" bare>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {POSTERS.map((v) => (
            <div key={v} className="relative aspect-[16/10] overflow-hidden rounded-xl">
              <ScenePoster variant={v} />
              <span className="absolute bottom-2 left-3 font-mono text-xs opacity-80">{v}</span>
            </div>
          ))}
        </div>
      </Plate>
    </main>
  );
}
