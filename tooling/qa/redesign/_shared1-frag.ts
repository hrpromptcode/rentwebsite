import { listTemplates } from "@rentweb/templates";
import { splitWords, graphemeCount } from "../../../packages/ui/src/motion/split";
const seen = new Map<string, string>();
const walk = (v: unknown, key = "") => {
  if (typeof v === "string") {
    if (/^(heading|title|eyebrow|name|kicker|text|statement)$/.test(key) && /[฀-๿]/.test(v)) {
      const toks = splitWords(v).filter((t) => /[฀-๿]/.test(t));
      toks.forEach((t, i) => {
        const g = graphemeCount(t);
        if (g <= 2 && !/^(ๆ|ที่|ใน|และ|ให้|ได้|มา|ไป|กับ|จาก|แล้ว|ของ|คุณ|เรา|ทุก|วัน|ก็|นี้|จะ|ไม่|มี|ดี|ใจ|ไว|ใช้|หา|ต่อ|รอ|ชิ้น|ผ้า|มือ|ง่าย|เดียว|ทำ|ใหม่|คน|งาน|ปี|นาที|ใกล้|ห้อง|หาด|ทะเล|ลม|น้ำ|แสง|เช้า|ค่ำ|เย็น|บ่าย|สด|ร้าน|เมนู|ชม\.|โต๊ะ|ครัว|ข้าว|กิน|ดื่ม|ชา|กาแฟ|เค้ก|ขนม|หวาน|นุ่ม|หอม|อบ|เขา|ริม|บ้าน|พัก|นอน|ฟรี|ทัก|จอง|เกม|เติม|บัตร|คิว|ตัว|ผิว|สวย|เห็น|ผล|ไหน|ช้า|ลึก|ขยับ|ฝาก|ส่ง|ซื้อ|ขาย|รับ|เปิด|ปิด|ครั้ง|เวลา|สุข|แค่|อยู่|บน|ใต้|ทาง|เดิน|สอง|สาม|หนึ่ง|นิด|นึง|ขึ้น|ลง|กว่า|เป็น|ยัง|อีก|หรือ|แต่|ถึง|ตาม|ว่า|เพื่อ|ช่วย|เอง|ใคร|ไหม|ครับ|ค่ะ|นะ|จริง|เลย|กัน|โดย|แบบ|ตอน|หลัง|ก่อน|เคย|ชอบ|รัก|ลอง|ดู|ฟัง|อ่าน|เขียน|เล่น|เรียน|สอน|ครู|ศิษย์|ศาลา|สปา|ยา|หมอ|แพทย์|ฟัน|เล็บ|ผม|หน้า|ตา|ปาก|มือ|เท้า|ขา|หลัง|ตัว|ใจ)$/.test(t)) {
          const ctx = toks.slice(Math.max(0, i - 1), i + 2).join("|");
          if (!seen.has(ctx)) seen.set(ctx, v.replace(/\n/g, "⏎").slice(0, 60));
        }
      });
    }
  } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
};
for (const t of listTemplates()) for (const pg of t.pages) walk(pg.sections ?? []);
for (const [ctx, src] of seen) console.log(ctx.padEnd(28), " ← ", src);
