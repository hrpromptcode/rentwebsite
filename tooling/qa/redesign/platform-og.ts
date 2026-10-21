import path from "node:path";
import fs from "node:fs";
import { chromium } from "@playwright/test";

/**
 * Renders the platform Open Graph image (1200×630) → apps/web/public/showcase/og.png
 *   cd tooling && pnpm exec tsx qa/redesign/platform-og.ts   (re-run after re-capturing the showcase screenshots)
 */
const SHOW = path.resolve(process.cwd(), "../apps/web/public/showcase");
const img = (k: string) => `data:image/webp;base64,${fs.readFileSync(path.join(SHOW, `${k}.webp`)).toString("base64")}`;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600&family=Unbounded:wght@600&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#07080B;color:#F3F1EC;font-family:Anuphan,sans-serif;position:relative}
.glow{position:absolute;inset:0;background:radial-gradient(50% 60% at 78% 40%,rgba(255,107,61,.32),transparent 70%),radial-gradient(40% 50% at 95% 85%,rgba(142,125,255,.28),transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(to right,rgba(243,241,236,.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(243,241,236,.06) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(70% 70% at 60% 40%,#000 30%,transparent 80%)}
.logo{position:absolute;left:64px;top:56px;font:600 34px Unbounded;letter-spacing:-.04em;display:flex;align-items:baseline;gap:6px}
.dot{width:14px;height:14px;border-radius:99px;background:#FF6B3D;box-shadow:0 0 18px #FF6B3D}
.mono{position:absolute;right:64px;top:66px;font:500 15px 'JetBrains Mono';letter-spacing:.08em;color:#A3A099}
h1{position:absolute;left:64px;top:170px;width:620px;font:600 76px/1.2 Anuphan}
p{position:absolute;left:64px;bottom:64px;font:500 24px Anuphan;color:#A3A099}
p b{color:#FF6B3D;font-weight:600}
.stage{position:absolute;right:-60px;top:120px;width:620px;height:460px;perspective:1400px}
.card{position:absolute;width:420px;aspect-ratio:16/10;border-radius:14px;background-size:cover;background-position:top;box-shadow:0 30px 80px -20px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.08)}
</style></head><body><div class="glow"></div><div class="grid"></div>
<div class="logo">RentWeb<span class="dot"></span></div><div class="mono">10 TEMPLATES · THAI SME</div>
<h1>เปิดเว็บธุรกิจ<br>ของคุณ ใน 5 นาที</h1>
<p>ร้านค้า · คลินิก · ร้านอาหาร · โรงแรม · อีเวนต์ — <b>ทดลองฟรี 14 วัน</b></p>
<div class="stage">
<div class="card" style="left:150px;top:10px;transform:rotateY(-18deg) rotateZ(4deg);background-image:url(${img("events")})"></div>
<div class="card" style="left:40px;top:140px;transform:rotateY(-18deg) rotateZ(-3deg);background-image:url(${img("restaurant")})"></div>
<div class="card" style="left:190px;top:250px;transform:rotateY(-18deg) rotateZ(2deg);background-image:url(${img("shop")})"></div>
</div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(SHOW, "og.png") });
await browser.close();
console.log("wrote", path.join(SHOW, "og.png"));
