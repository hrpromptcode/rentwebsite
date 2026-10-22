import * as React from "react";

/**
 * Line-break guard for tenant-entered names in cards, rows and tickets (pure string work: no Intl.Segmenter, so server and
 * client render the same markup; text content is unchanged — spaces stay plain spaces, so getByText / accessible names match):
 *  - a number and its unit never part ("60 | นาที", "฿4,900 | เริ่มต้น" keeps "เริ่มต้น" whole),
 *  - a short parenthetical stays on one line ("(2 | ท่าน)", "(HIFU | + Pico + Botox)"),
 *  - a trailing "/" or "+" stays with the word before it ("ลดกราม / ริ้วรอย" never starts a line with "/"),
 *  - short Thai words (≤ 8 visible characters) never split mid-word; longer runs keep the browser's own Thai breaking.
 * mode "name" (people): every space-separated part is kept whole ("ทพญ.พิมพ์ | ชนก" never happens).
 */
const THAI = /[฀-๿]/;
const MARKS = /[ัิ-ฺ็-๎]/g;
const UNIT = /^(?:นาที|ชม\.?|ชั่วโมง|ครั้ง|ท่าน|คน|วัน|เดือน|ปี|รอบ|สัปดาห์|คลาส|ชิ้น|ซีซี|ยูนิต|cc|ml|units?|min)\)?$/i;
const NUMERIC = /^[(฿$]?[\d.,]+[)%]?$/;

function visible(s: string): number {
  return s.replace(MARKS, "").length;
}

export function nameGroups(text: string, mode: "auto" | "name" = "auto"): Array<{ t: string; keep: boolean }> {
  const tokens = text.trim().split(/ +/).filter(Boolean);
  const out: Array<{ t: string; keep: boolean }> = [];
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i]!;
    let keep = mode === "name";
    // parenthetical "(…)" across a few tokens
    if (t.startsWith("(") && !t.includes(")")) {
      let j = i;
      let acc = t;
      while (j + 1 < tokens.length && !acc.includes(")")) acc += ` ${tokens[++j]}`;
      if (acc.includes(")") && visible(acc) <= 24) {
        t = acc;
        i = j;
        keep = true;
      }
    }
    // number + unit
    const next = tokens[i + 1];
    if (!keep && NUMERIC.test(t) && next && UNIT.test(next)) {
      t = `${t} ${next}`;
      i++;
      keep = true;
    }
    // "/" or "+" joins the word before it
    const after = tokens[i + 1];
    if (after === "/" || after === "+" || after === "&" || after === "·") {
      t = `${t} ${after}`;
      i++;
      keep = keep || visible(t) <= 12;
    }
    if (!keep && THAI.test(t) && visible(t) <= 8) keep = true;
    out.push({ t, keep });
  }
  return out;
}

export function NameWrap({ text, mode = "auto" }: { text: string; mode?: "auto" | "name" }) {
  const groups = nameGroups(text, mode);
  return (
    <>
      {groups.map((g, i) => (
        <React.Fragment key={i}>
          {i > 0 && " "}
          {g.keep ? <span className="whitespace-nowrap">{g.t}</span> : g.t}
        </React.Fragment>
      ))}
    </>
  );
}
