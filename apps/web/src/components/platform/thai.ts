import { graphemes } from "@rentweb/ui/motion/split";

/**
 * Thai glue for display copy. Chrome's and Node's Thai dictionaries both split loanwords and some compounds
 * ("สตูดิ|โอ", "จากไอ|เดีย", "ราย|ละ|เอียด", "รี|สอร์ต"), which looks broken in big type. `tg()`:
 *   - keeps every `{group}` on one line, and
 *   - automatically protects the loanwords in LOANWORDS,
 * by joining the group's grapheme clusters with U+2060 WORD JOINER (no break opportunity, invisible, shaping-safe) and
 * putting U+200B ZERO WIDTH SPACE on both sides, so the dictionary sees whole words around it (a group glued straight
 * onto the previous word made Chrome split that word, e.g. "เรื่อ|ง"). Pure → SSR and hydration agree, and the kit's
 * SplitReveal segments the result identically on the server.
 */
const WJ = String.fromCharCode(0x2060);
const ZWSP = String.fromCharCode(0x200b);

const LOANWORDS = [
  "เทมเพลต", "แพลตฟอร์ม", "เว็บไซต์", "สำเร็จรูป", "ออนไลน์", "แฟชั่น", "ไลฟ์สไตล์", "สไตล์", "คลินิก", "ทันตกรรม",
  "ซาลอน", "รีสอร์ต", "โฮมสเตย์", "วิลล่า", "เอเจนซี่", "เอเจนซี", "คาเฟ่", "เบเกอรี่", "สตูดิโอ", "อีเวนต์", "คอนเสิร์ต",
  "เวิร์กช็อป", "สัมมนา", "โดเมน", "ฟีเจอร์", "ฟอนต์", "โลโก้", "ดีไซน์", "แพ็กเกจ", "คอร์ส", "คลาสพาส", "คลาส", "เดโม",
  "ไอเดีย", "สลิป", "พร้อมเพย์", "บล็อก", "ออเดอร์", "เมนู", "โยคะ", "แบรนด์", "ไซซ์", "ทรีตเมนต์", "รายละเอียด",
  "อัตโนมัติ", "แอดมิน", "โปรโมชัน", "สปา", "ลูกค้า",
].sort((a, b) => b.length - a.length);
const AUTO = new RegExp(`(${LOANWORDS.join("|")})`, "g");

const OPEN = /[(\[{“‘"'«]$/;
const CLOSE = /^[)\]}”’"'».,!?:;…]/;

/** joins a group; the ZWSP break opportunities are skipped next to brackets / quotes / closing punctuation */
const glue = (w: string, before: string, after: string) =>
  (OPEN.test(before) ? "" : ZWSP) + graphemes(w).join(WJ) + (CLOSE.test(after) ? "" : ZWSP);

export function tg(text: string): string {
  // mark loanwords in plain runs as {groups}, then glue every group with knowledge of its neighbours
  const marked = text
    .split(/(\{[^}]+\})/g)
    .map((part) => (part.startsWith("{") && part.endsWith("}") ? part : part.replace(AUTO, (w) => `{${w}}`)))
    .join("");
  return marked.replace(/\{([^}]+)\}/g, (_m, w: string, offset: number, all: string) => {
    const before = all.slice(0, offset).replace(/\{|\}/g, "").slice(-1);
    const after = all.slice(offset + w.length + 2).replace(/\{|\}/g, "").slice(0, 1);
    return glue(w, before, after);
  });
}
