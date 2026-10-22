import * as React from "react";

/*
 * Thai line breaking for event titles (SERVER ONLY — segmentation must not run again on the client: Node and browser
 * ICU builds may differ → hydration mismatch). Chromium breaks Thai with the ICU dictionary, which does not know many
 * transliterated loanwords common in event names: "โฟล์กกลางแจ้ง" breaks as โฟล์|กก|ลาง, "เวิร์กช็อปงานไม้" as
 * เวิร์|กช็อ|ปงาน. We keep a small glue list of such words, segment the rest with Intl.Segmenter, wrap every Thai word in
 * a nowrap span and put a <wbr> between neighbouring Thai words — lines can then only break between real words. The
 * text content (and therefore accessible names / Playwright text matching) is unchanged. "ๆ" stays glued to its word.
 */
const GLUE = [
  "เวิร์กช็อป", "เวิร์กชอป", "เวิร์ก", "โฟล์ก", "ทำมือ", "ทอล์ก", "อาร์ต", "มาร์เก็ต", "มาร์เกต", "ช็อป", "คราฟต์", "สตรีท", "ฟู้ด", "เฟสติวัล",
  "เฟสทิวัล", "ไลฟ์", "ดีไซน์", "ปาร์ตี้", "คอนเสิร์ต", "แจ๊ส", "ร็อก", "ป๊อป", "อินดี้", "ไวน์", "คาเฟ่", "สตูดิโอ", "ฟอรั่ม", "ซัมมิต",
  "อีเวนต์", "แฟร์", "มาราธอน", "ฮาล์ฟ", "เทรล", "ไนท์", "ดีเจ", "ซาวด์", "แกลเลอรี", "เมกเกอร์", "สปีกเกอร์", "เน็ตเวิร์ก",
].sort((a, b) => b.length - a.length);
const GLUE_SET = new Set(GLUE);
const GLUE_RE = new RegExp(`(${GLUE.join("|")})`, "g");
const TH = /[฀-๿]/;

let segmenter: Intl.Segmenter | null = null;

/** Word tokens of a Thai / mixed string (spaces kept as their own tokens). */
export function thaiTokens(text: string): string[] {
  segmenter ??= new Intl.Segmenter("th", { granularity: "word" });
  const raw: string[] = [];
  for (const part of text.split(GLUE_RE)) {
    if (!part) continue;
    if (GLUE_SET.has(part)) raw.push(part);
    else for (const s of segmenter.segment(part)) raw.push(s.segment);
  }
  const out: string[] = [];
  for (const t of raw) {
    // "เร็ว ๆ" → one token; a lone combining mark (rare dictionary miss) joins the word before it
    if (out.length && (/^ๆ/.test(t) || /^[ัิ-ฺ็-๎]/.test(t))) {
      let ws = "";
      while (out.length && /^\s+$/.test(out[out.length - 1]!)) ws = out.pop()! + ws;
      if (out.length) out[out.length - 1] += ws + t;
      else out.push(ws + t);
      continue;
    }
    out.push(t);
  }
  return out;
}

/** Renders `text` with breaks allowed only between words (see above). Latin-only strings pass through untouched. */
export function ThaiWrap({ text }: { text: string }) {
  if (!text || !TH.test(text)) return <>{text}</>;
  const toks = thaiTokens(text);
  return (
    <>
      {toks.map((t, i) => {
        const th = TH.test(t);
        const next = toks[i + 1];
        return (
          <React.Fragment key={i}>
            {th ? <span className="whitespace-nowrap">{t}</span> : t}
            {th && next && TH.test(next.charAt(0)) ? <wbr /> : null}
          </React.Fragment>
        );
      })}
    </>
  );
}
