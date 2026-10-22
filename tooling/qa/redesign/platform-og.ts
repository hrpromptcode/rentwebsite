import path from "node:path";
import fs from "node:fs";
import { chromium } from "@playwright/test";

/**
 * Renders the platform Open Graph image (1200×630) → apps/web/public/showcase/og.png
 *   cd tooling && pnpm exec tsx qa/redesign/platform-og.ts   (re-run after re-capturing the showcase screenshots)
 */
const SHOW = path.resolve(process.cwd(), "../apps/web/public/showcase");
const img = (k: string) => `data:image/webp;base64,${fs.readFileSync(path.join(SHOW, `${k}.webp`)).toString("base64")}`;
const MARK = `data:image/png;base64,${fs.readFileSync(path.resolve(SHOW, "../brand/promptcode-mark.png")).toString("base64")}`;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600&family=Manrope:wght@700;800&family=JetBrains+Mono:wght@500&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:#F6F8FC;color:#1B2233;font-family:Anuphan,sans-serif;position:relative}
.mesh{position:absolute;inset:0;background:radial-gradient(42% 60% at 6% 0%,#CDEFF7,transparent 70%),radial-gradient(40% 55% at 72% 8%,#FFD6E5,transparent 70%),radial-gradient(45% 60% at 96% 96%,#FFE2D3,transparent 70%),radial-gradient(42% 58% at 28% 100%,#D6E4FA,transparent 70%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(to right,rgba(21,97,183,.07) 1px,transparent 1px),linear-gradient(to bottom,rgba(21,97,183,.07) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(70% 70% at 60% 40%,#000 30%,transparent 80%)}
.ghost{position:absolute;left:0;right:0;bottom:-34px;text-align:center;font:800 230px/1 Manrope;letter-spacing:-.05em;color:transparent;-webkit-text-stroke:1.5px rgba(21,97,183,.1)}
.logo{position:absolute;left:64px;top:52px;display:flex;align-items:center;gap:12px}
.logo img{height:46px}
.logo b{display:block;font:800 34px/1 Manrope;letter-spacing:-.035em}
.logo small{display:block;margin-top:5px;font:700 12px/1 Manrope;letter-spacing:.14em;color:#5B6477}
.mono{position:absolute;right:64px;top:66px;font:500 15px 'JetBrains Mono';letter-spacing:.08em;color:#5B6477}
h1{position:absolute;left:64px;top:170px;width:640px;font:600 76px/1.2 Anuphan}
h1 span{background:linear-gradient(100deg,#E8632E,#EF4F52 45%,#E0246C);-webkit-background-clip:text;background-clip:text;color:transparent;padding:.12em 0}
p{position:absolute;left:64px;bottom:64px;font:500 24px Anuphan;color:#5B6477}
p b{color:#fff;font-weight:600;background:linear-gradient(120deg,#0B78B4,#1670C4 40%,#194FA9);padding:6px 16px;border-radius:99px;margin-left:6px}
.stage{position:absolute;right:-60px;top:120px;width:620px;height:460px;perspective:1400px}
.halo{position:absolute;left:60px;top:40px;width:520px;height:380px;border-radius:50%;background:radial-gradient(closest-side at 35% 40%,rgba(14,192,220,.38),transparent),radial-gradient(closest-side at 70% 65%,rgba(255,46,126,.28),transparent),radial-gradient(closest-side at 62% 22%,rgba(255,159,90,.3),transparent);filter:blur(30px)}
.card{position:absolute;width:420px;aspect-ratio:16/10;border-radius:14px;background-size:cover;background-position:top;border:4px solid #fff;box-shadow:0 40px 80px -30px rgba(21,97,183,.55),0 0 0 1px rgba(21,97,183,.1)}
</style></head><body><div class="mesh"></div><div class="grid"></div><div class="ghost">RENTWEB</div>
<div class="logo"><img src="${MARK}" alt=""><span><b>RentWeb</b><small>BY PROMPTCODE</small></span></div><div class="mono">10 TEMPLATES · THAI SME</div>
<h1>เปิดเว็บธุรกิจ<br>ของคุณ ใน <span>5 นาที</span></h1>
<p>ร้านค้า · คลินิก · ร้านอาหาร · โรงแรม · อีเวนต์ <b>ทดลองฟรี 14 วัน</b></p>
<div class="stage"><div class="halo"></div>
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
