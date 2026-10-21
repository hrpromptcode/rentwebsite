/**
 * CSS for the 3D kit's DOM parts (fallback strips, mirrors, labels, CSS posters). Hoisted + de-duplicated by
 * React 19 (`<style href precedence>`), so any wrapper can render <KitStyles/> and it lands once in <head>.
 * Server-safe.
 */
const CSS = /* css */ `
.rw3d-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}

/* ---------- CurvedGallery ---------- */
.rw3d-gallery{position:relative;width:100%;overflow:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none;isolation:isolate}
.rw3d-gallery[data-height=screen]{height:100svh;min-height:560px}
.rw3d-gallery[data-height=tall]{height:130svh;min-height:680px}
.rw3d-gallery[data-height=compact]{height:min(74svh,760px);min-height:460px}
.rw3d-gallery[data-dragging=true]{cursor:grabbing}
.rw3d-gallery[data-hovering=true]{cursor:pointer}
.rw3d-strip{position:absolute;inset:0;display:flex;align-items:center;gap:clamp(12px,2vw,28px);margin:0;padding:0 calc(50% - var(--rw3d-card-w)/2);list-style:none;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;perspective:1100px;perspective-origin:50% 45%;--rw3d-card-h:min(58%,520px);--rw3d-card-w:calc(var(--rw3d-card-h)*var(--rw3d-aspect,0.8))}
.rw3d-strip::-webkit-scrollbar{display:none}
.rw3d-strip>li{flex:0 0 auto;width:var(--rw3d-card-w);height:var(--rw3d-card-h);scroll-snap-align:center;transform-style:preserve-3d;transform:rotateY(var(--ry,0deg)) translateZ(var(--tz,0px)) scale(var(--sc,1));transition:transform 120ms linear}
.rw3d-strip a,.rw3d-strip .rw3d-card{position:relative;display:block;width:100%;height:100%;overflow:hidden;border-radius:calc(var(--radius,12px)*1.6);background:var(--surface);color:#fff;text-decoration:none;box-shadow:0 30px 80px -30px color-mix(in oklab,var(--foreground) 45%,transparent);outline-offset:4px}
.rw3d-strip a:focus-visible{outline:2px solid var(--ring)}
.rw3d-strip img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform 700ms cubic-bezier(.16,1,.3,1),filter 400ms}
.rw3d-strip a:hover img{transform:scale(1.04)}
.rw3d-strip .rw3d-cap{position:absolute;inset:auto 0 0 0;padding:16px 18px 18px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.72));display:grid;gap:2px;line-height:1.35}
.rw3d-strip .rw3d-cap strong{font-family:var(--font-heading);font-size:clamp(1rem,.9rem + .4vw,1.25rem);font-weight:600}
.rw3d-strip .rw3d-cap span{font-size:.8125rem;opacity:.8}
.rw3d-strip .rw3d-tag{position:absolute;top:12px;left:12px;padding:4px 10px;border-radius:999px;font-size:.75rem;background:color-mix(in oklab,var(--background) 70%,transparent);color:var(--foreground);backdrop-filter:blur(8px)}
.rw3d-strip[data-mode=mirror]{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important;padding:0!important}
.rw3d-gallery-label{position:absolute;left:0;top:0;z-index:3;pointer-events:none;display:grid;justify-items:center;gap:2px;padding:10px 16px;min-width:140px;max-width:min(320px,80vw);text-align:center;border-radius:14px;color:var(--foreground);background:color-mix(in oklab,var(--background) 72%,transparent);border:1px solid color-mix(in oklab,var(--foreground) 14%,transparent);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);opacity:0;transform:translate3d(-50%,0,0);transition:opacity 240ms cubic-bezier(.25,1,.5,1);line-height:1.35;will-change:transform}
.rw3d-gallery-label[data-visible=true]{opacity:1}
.rw3d-gallery-label[data-focus=true]{outline:2px solid var(--ring);outline-offset:3px}
.rw3d-gallery-label strong{font-family:var(--font-heading);font-weight:600;font-size:clamp(.95rem,.9rem + .3vw,1.125rem)}
.rw3d-gallery-label span{font-size:.8125rem;opacity:.75}
.rw3d-gallery-label [data-k=tag]{font-family:var(--font-mono,ui-monospace,monospace);font-size:.6875rem;letter-spacing:.08em;opacity:.6}
.rw3d-gallery-label [data-k=tag]:empty,.rw3d-gallery-label [data-k=subtitle]:empty{display:none}

/* ---------- WormholeTunnel ---------- */
.rw3d-tunnel{position:relative;width:100%}
.rw3d-tunnel[data-length=short]{height:200svh}
.rw3d-tunnel[data-length=normal]{height:300svh}
.rw3d-tunnel[data-length=long]{height:400svh}
.rw3d-tunnel-stage{position:sticky;top:0;height:100svh;min-height:520px;overflow:hidden;isolation:isolate}
.rw3d-tunnel-rings{position:absolute;inset:0;perspective:600px;perspective-origin:50% 50%;overflow:hidden}
.rw3d-tunnel-rings i{position:absolute;left:50%;top:50%;width:min(140vw,1400px);aspect-ratio:1;border-radius:50%;border:1px solid color-mix(in oklab,var(--rw3d-tint,var(--primary)) 55%,transparent);transform:translate(-50%,-50%) translateZ(calc(var(--z) + var(--p,0) * 1200px));opacity:calc(.15 + var(--o,1) * .6);box-shadow:0 0 40px -12px color-mix(in oklab,var(--rw3d-tint,var(--primary)) 60%,transparent) inset}
.rw3d-tunnel-overlay{position:absolute;inset:0;z-index:2;display:grid;place-items:center;padding:clamp(16px,4vw,64px);pointer-events:none;text-align:center}
.rw3d-tunnel-step{grid-area:1/1;max-width:min(860px,92vw);opacity:0;transform:translateY(24px);filter:blur(6px);transition:opacity 600ms cubic-bezier(.16,1,.3,1),transform 900ms cubic-bezier(.16,1,.3,1),filter 600ms;line-height:1.25}
.rw3d-tunnel-step[data-active=true]{opacity:1;transform:none;filter:none}
.rw3d-tunnel-step .k{display:inline-block;margin-bottom:14px;font-family:var(--font-mono,ui-monospace,monospace);font-size:.8125rem;letter-spacing:.08em;opacity:.7}
.rw3d-tunnel-step h3{margin:0;font-family:var(--font-display,var(--font-heading));font-size:clamp(2rem,1.4rem + 3vw,4.5rem);font-weight:650;line-height:1.2;text-wrap:balance}
.rw3d-tunnel-step p{margin:16px auto 0;max-width:52ch;font-size:clamp(1rem,.96rem + .2vw,1.125rem);line-height:1.7;opacity:.8;text-wrap:pretty}
.rw3d-tunnel-scrim{position:absolute;inset:0;z-index:1;pointer-events:none;background:radial-gradient(60% 50% at 50% 50%,color-mix(in oklab,var(--background) 62%,transparent) 0%,transparent 100%)}
.rw3d-tunnel-progress{position:absolute;z-index:3;left:50%;bottom:clamp(16px,4vh,40px);transform:translateX(-50%);display:flex;gap:8px;pointer-events:none}
.rw3d-tunnel-progress b{width:28px;height:2px;border-radius:2px;background:color-mix(in oklab,var(--foreground) 22%,transparent);transition:background 300ms}
.rw3d-tunnel-progress b[data-on=true]{background:var(--rw3d-tint,var(--primary))}
.rw3d-tunnel-list{list-style:none;margin:0;padding:0}
@media (prefers-reduced-motion: reduce){
  .rw3d-tunnel[data-length]{height:auto}
  .rw3d-tunnel-stage{position:relative;height:auto;min-height:0;overflow:visible}
  .rw3d-tunnel-stage>[data-scene-status],.rw3d-tunnel-overlay,.rw3d-tunnel-progress,.rw3d-tunnel-scrim{display:none}
  .rw3d-tunnel-list.rw3d-sr{position:static!important;width:auto!important;height:auto!important;margin:0!important;overflow:visible!important;clip:auto!important;clip-path:none!important;white-space:normal!important}
}
.rw3d-tunnel-list small{display:block;font-family:var(--font-mono,ui-monospace,monospace);font-size:.75rem;letter-spacing:.06em;opacity:.65;margin-bottom:4px}
@media (prefers-reduced-motion: reduce){
  .rw3d-tunnel-list{display:grid;gap:clamp(12px,2vw,24px);grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));padding:clamp(24px,5vw,64px) clamp(16px,4vw,48px)!important}
  .rw3d-tunnel-list>li{position:relative;padding:28px 24px;border-radius:calc(var(--radius,12px)*1.4);background:color-mix(in oklab,var(--surface) 80%,transparent);border:1px solid color-mix(in oklab,var(--foreground) 10%,transparent);line-height:1.6}
  .rw3d-tunnel-list .n{display:block;font-family:var(--font-accent,var(--font-display));font-size:clamp(2.5rem,2rem + 2vw,4rem);line-height:1.1;color:var(--rw3d-tint,var(--primary));margin-bottom:12px}
  .rw3d-tunnel-list h3{margin:0 0 6px;font-family:var(--font-heading);font-size:1.25rem;line-height:1.4}
  .rw3d-tunnel-list p{margin:0;opacity:.75}
}

/* ---------- BreathingOrb ---------- */
.rw3d-breath{position:relative;width:100%;height:100%;min-height:320px}
.rw3d-breath-cue{position:absolute;left:50%;bottom:clamp(12px,6%,48px);transform:translateX(-50%);z-index:2;display:flex;align-items:center;gap:12px;padding:10px 18px 10px 12px;border-radius:999px;background:color-mix(in oklab,var(--background) 70%,transparent);border:1px solid color-mix(in oklab,var(--foreground) 12%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--foreground);line-height:1.3;white-space:nowrap}
.rw3d-breath-cue svg{width:34px;height:34px;transform:rotate(-90deg)}
.rw3d-breath-cue circle{fill:none;stroke-width:3}
.rw3d-breath-cue .t{font-weight:600;font-size:1rem;min-width:6.5em}
.rw3d-breath-orb{position:absolute;left:50%;top:50%;width:min(62%,62vh);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle at 38% 32%,color-mix(in oklab,var(--glow) 90%,#fff) 0%,var(--primary) 38%,color-mix(in oklab,var(--primary) 55%,var(--background)) 72%,transparent 73%);box-shadow:0 0 120px -20px var(--glow),inset -20px -30px 80px color-mix(in oklab,var(--accent) 35%,transparent);animation:rw3d-breathe 16s cubic-bezier(.45,0,.55,1) infinite}
@keyframes rw3d-breathe{0%{transform:translate(-50%,-50%) scale(.82)}25%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1)}87.5%{transform:translate(-50%,-50%) scale(.82)}100%{transform:translate(-50%,-50%) scale(.82)}}
.rw3d-breath-list{position:absolute;left:50%;bottom:clamp(12px,6%,48px);transform:translateX(-50%);display:flex;gap:10px;margin:0;padding:0;list-style:none;z-index:2;flex-wrap:wrap;justify-content:center}
.rw3d-breath-list li{padding:6px 14px;border-radius:999px;background:color-mix(in oklab,var(--background) 70%,transparent);border:1px solid color-mix(in oklab,var(--foreground) 12%,transparent);font-size:.875rem;line-height:1.4}
@media (prefers-reduced-motion: reduce){.rw3d-breath-orb{animation:none}}

/* ---------- ImageSilk fallback ---------- */
.rw3d-silk{position:relative;width:100%;height:100%}
.rw3d-silk-frame{position:absolute;inset:6% 8% 4%;transform-origin:50% 0;animation:rw3d-silk-sway 7s ease-in-out infinite;filter:drop-shadow(0 40px 50px color-mix(in oklab,var(--foreground) 28%,transparent))}
.rw3d-silk-frame img{width:100%;height:100%;object-fit:cover;clip-path:polygon(0 0,100% 0,99% 25%,100% 50%,98.5% 75%,100% 100%,0 99%,1.5% 75%,0 50%,1% 25%);animation:rw3d-silk-clip 5s ease-in-out infinite}
.rw3d-silk-rod{position:absolute;left:5%;right:5%;top:5%;height:4px;border-radius:4px;background:linear-gradient(90deg,color-mix(in oklab,var(--foreground) 50%,transparent),var(--foreground),color-mix(in oklab,var(--foreground) 50%,transparent))}
@keyframes rw3d-silk-sway{0%,100%{transform:skewX(0deg) rotate(0deg)}50%{transform:skewX(-1.6deg) rotate(.6deg)}}
@keyframes rw3d-silk-clip{0%,100%{clip-path:polygon(0 0,100% 0,99% 25%,100% 50%,98.5% 75%,100% 100%,0 99%,1.5% 75%,0 50%,1% 25%)}50%{clip-path:polygon(0 0,100% 0,100% 25%,98.8% 50%,100% 75%,99% 100%,0 100%,0 75%,1.4% 50%,0 25%)}}
@media (prefers-reduced-motion: reduce){.rw3d-silk-frame,.rw3d-silk-frame img{animation:none}}

/* ---------- SteamRise fallback ---------- */
.rw3d-steam{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.rw3d-steam i{position:absolute;bottom:-10%;width:38%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.28) 0%,rgba(255,255,255,0) 65%);filter:blur(18px);animation:rw3d-steam 9s ease-in infinite;opacity:0}
.rw3d-steam i:nth-child(1){left:22%;animation-delay:0s}
.rw3d-steam i:nth-child(2){left:40%;animation-delay:3s}
.rw3d-steam i:nth-child(3){left:55%;animation-delay:6s}
@keyframes rw3d-steam{0%{transform:translateY(0) scale(.6);opacity:0}20%{opacity:.9}100%{transform:translateY(-120%) scale(1.6) translateX(10%);opacity:0}}
@media (prefers-reduced-motion: reduce){.rw3d-steam i{animation:none;opacity:.5;transform:translateY(-40%) scale(1.1)}}

/* ---------- Ticket3D fallback / mirror ---------- */
.rw3d-ticket{position:relative;width:100%;height:100%;display:grid;place-items:center}
.rw3d-ticket-css{position:relative;width:min(92%,560px);aspect-ratio:2.2/1;display:grid;grid-template-columns:1fr auto;border-radius:22px;overflow:hidden;color:var(--primary-foreground,#fff);background:linear-gradient(125deg,var(--primary),color-mix(in oklab,var(--accent) 70%,var(--primary)));box-shadow:0 40px 90px -30px color-mix(in oklab,var(--primary) 70%,transparent);transform:rotate(-6deg);line-height:1.3}
.rw3d-ticket-css::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.35) 45%,transparent 60%);mix-blend-mode:overlay}
.rw3d-ticket-css .main{padding:clamp(16px,4%,28px);display:grid;align-content:space-between;gap:8px}
.rw3d-ticket-css .main strong{font-family:var(--font-display,var(--font-heading));font-size:clamp(1.25rem,1rem + 1.4vw,2rem);line-height:1.2}
.rw3d-ticket-css .meta{font-size:.875rem;opacity:.85}
.rw3d-ticket-css .stub{display:grid;place-items:center;padding:0 clamp(14px,3%,24px);border-left:2px dashed color-mix(in oklab,currentColor 45%,transparent);font-family:var(--font-mono,ui-monospace,monospace);font-size:.8125rem;writing-mode:vertical-rl;letter-spacing:.08em}
.rw3d-ticket[data-live=true] .rw3d-ticket-css{visibility:hidden}

/* ---------- CardStack3D fallback ---------- */
.rw3d-stack{position:relative;width:100%;height:100%;min-height:360px}
.rw3d-stack-fan{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;margin:0;padding:0;list-style:none}
.rw3d-stack-fan li{position:absolute;width:min(34%,240px);aspect-ratio:3/4;transform:translateX(calc(var(--i) * 46%)) rotate(calc(var(--i) * 7deg)) translateY(calc(var(--a) * 6%));transition:transform 500ms cubic-bezier(.16,1,.3,1)}
.rw3d-stack-fan a,.rw3d-stack-fan .rw3d-card{position:relative;display:block;width:100%;height:100%;border-radius:18px;overflow:hidden;background:var(--surface);box-shadow:0 0 0 1px color-mix(in oklab,var(--accent) 50%,transparent),0 30px 60px -20px color-mix(in oklab,var(--accent) 45%,transparent);color:#fff;text-decoration:none;outline-offset:4px}
.rw3d-stack-fan a:focus-visible{outline:2px solid var(--ring)}
.rw3d-stack-fan img{width:100%;height:100%;object-fit:cover}
.rw3d-stack-fan .rw3d-cap{position:absolute;inset:auto 0 0;padding:12px 14px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.75));font-weight:600;line-height:1.35}
.rw3d-stack-fan .rw3d-badge{position:absolute;top:10px;right:10px;padding:3px 9px;border-radius:999px;font-size:.6875rem;font-weight:700;background:var(--accent);color:var(--accent-foreground,#000)}
.rw3d-stack-fan:hover li{transform:translateX(calc(var(--i) * 62%)) rotate(calc(var(--i) * 10deg)) translateY(calc(var(--a) * 8%))}
.rw3d-stack-fan[data-mode=mirror]{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important}
@media (prefers-reduced-motion: reduce){.rw3d-stack-fan li,.rw3d-strip>li{transition:none}}
`;

export function KitStyles() {
  return (
    // React 19 hoists <style href precedence> into <head> once, wherever it is rendered (server or client).
    <style href="rw-three-kit" precedence="default">
      {CSS}
    </style>
  );
}
