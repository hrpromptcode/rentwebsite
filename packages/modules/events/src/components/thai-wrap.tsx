import * as React from "react";

/*
 * Thai line breaking for event titles (SERVER ONLY — segmentation must not run again on the client: Node and browser
 * ICU builds may differ → hydration mismatch). Chromium breaks Thai with the ICU dictionary, which does not know many
 * transliterated loanwords common in event names: "โฟล์กกลางแจ้ง" breaks as โฟล์|กก|ลาง, "เวิร์กช็อปงานไม้" as
 * เวิร์|กช็อ|ปงาน. We keep a small glue list of such words, segment the rest with Intl.Segmenter, wrap every Thai word in
 * a nowrap span and put a <wbr> between neighbouring Thai words — lines can then only break between real words (compounds
 * such as เครื่องหนัง / การกุศล and place names are glued too). The
 * text content (and therefore accessible names / Playwright text matching) is unchanged. "ๆ" stays glued to its word.
 */
const GLUE = [
  "เวิร์กช็อป", "เวิร์กชอป", "เวิร์ก", "โฟล์ก", "ทำมือ", "ทอล์ก", "อาร์ต", "มาร์เก็ต", "มาร์เกต", "ช็อป", "คราฟต์", "สตรีท", "ฟู้ด", "เฟสติวัล",
  "เฟสทิวัล", "ไลฟ์", "ดีไซน์", "ปาร์ตี้", "คอนเสิร์ต", "แจ๊ส", "ร็อก", "ป๊อป", "อินดี้", "ไวน์", "คาเฟ่", "สตูดิโอ", "ฟอรั่ม", "ซัมมิต",
  "อีเวนต์", "แฟร์", "มาราธอน", "ฮาล์ฟ", "เทรล", "ไนท์", "ดีเจ", "ซาวด์", "แกลเลอรี", "เมกเกอร์", "สปีกเกอร์", "เน็ตเวิร์ก",
  // compounds / place names ICU splits into two dictionary words ("เครื่อง|หนัง" broke the leather-workshop h1)
  "เครื่องหนัง", "เครื่องดื่ม", "เครื่องประดับ", "การกุศล", "เจ้าพระยา", "คลองสาน", "กรุงเทพฯ", "กลางแจ้ง", "ริมน้ำ", "ตลาดนัด", "ครั้งที่", "ใบแรก",
  "นักวิ่ง", "ที่จอดรถ", "เสื้อรุ่น", "ที่นั่ง", "แถวหน้า",
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
  const raw = thaiTokens(text);
  // a Thai word + one space + a number stays on one line ("ครั้งที่ 7", "รุ่นที่ 2"): grouped in one nowrap span, the
  // space itself is kept (text content unchanged)
  const toks: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]!;
    if (TH.test(t) && raw[i + 1] === " " && /^\d/.test(raw[i + 2] ?? "")) {
      toks.push(`${t} ${raw[i + 2]}`);
      i += 2;
    } else if (/^[+&]$/.test(t) && raw[i + 1] === " " && TH.test(raw[i + 2] ?? "")) {
      // "VIP Runner (เสื้อรุ่นพิเศษ + ที่จอดรถ)": a lone "+" never starts a line
      toks.push(`${t} ${raw[i + 2]}`);
      i += 2;
    } else toks.push(t);
  }
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

/**
 * Client-safe variant (no Intl segmentation, so server and browser render the same markup): only the GLUE words are
 * kept whole (nowrap). For short data strings inside client components, e.g. ticket-type names in the picker
 * ("VIP (ที่นั่งแถวหน้า + เครื่อง⏎ดื่ม 2 แก้ว)").
 */
export function GlueWords({ text }: { text: string }) {
  if (!text || !TH.test(text)) return <>{text}</>;
  // glue words stay whole; a lone "+" / "&" sticks to the word after it ("แถวหน้า + เครื่องดื่ม", "+ ที่จอดรถ)")
  const parts = text.split(GLUE_RE).filter(Boolean);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i]!;
    const next = parts[i + 1];
    const lead = part.match(/[+&] $/);
    if (lead && next && GLUE_SET.has(next)) {
      part = part.slice(0, -2);
      if (part) out.push(<React.Fragment key={`${i}t`}>{part}</React.Fragment>);
      out.push(<span key={i} className="whitespace-nowrap">{`${lead[0]}${next}`}</span>);
      i++;
      continue;
    }
    if (GLUE_SET.has(part)) {
      out.push(<span key={i} className="whitespace-nowrap">{part}</span>);
      continue;
    }
    for (const [j, q] of part.split(/([+&] \S{1,12})/).entries()) if (q) out.push(/^[+&] /.test(q) ? <span key={`${i}.${j}`} className="whitespace-nowrap">{q}</span> : <React.Fragment key={`${i}.${j}`}>{q}</React.Fragment>);
  }
  return <>{out}</>;
}
