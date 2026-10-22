/** qa-c probe: which spelling keeps ๆ off the start of a line in Chromium (space / NBSP / WJ / none)? */
import { chromium } from "@playwright/test";
const variants: Record<string, string> = { space: " ๆ", nbsp: " ๆ", nbspwj: " ⁠ๆ", wj: "⁠ๆ", none: "ๆ" };
const base = (v: string) => `เล่าไอเดีย วันที่ และจำนวนคนคร่าว${v} เราจะส่งแพ็กเกจและวันว่างกลับไปภายในสองวันทำการ`;
const b = await chromium.launch();
const p = await b.newPage();
const html = Object.entries(variants).map(([k, v]) => Array.from({ length: 60 }, (_, i) => `<p data-k="${k}" style="width:${180 + i * 4}px;font:16px sans-serif;margin:0">${base(v)}</p>`).join("")).join("");
await p.setContent(`<html lang="th"><body>${html}</body></html>`);
const res = await p.evaluate(() => {
  const out: Record<string, number> = {};
  for (const el of Array.from(document.querySelectorAll("p"))) {
    const k = el.getAttribute("data-k")!;
    out[k] ??= 0;
    const t = el.firstChild as Text;
    const s = t.data;
    const r = document.createRange();
    let prevTop = -1;
    for (let i = 0; i < s.length; i++) {
      r.setStart(t, i);
      r.setEnd(t, i + 1);
      const rects = r.getClientRects();
      if (!rects.length) continue;
      const top = Math.round(rects[0]!.top);
      if (prevTop >= 0 && top > prevTop + 2) {
        // first visible char on a new line
        let j = i;
        while (j < s.length && /[\s ⁠]/.test(s[j]!)) j++;
        if (s[j] === "ๆ") out[k]++;
      }
      prevTop = top;
    }
  }
  return out;
});
console.log(JSON.stringify(res));
await b.close();
