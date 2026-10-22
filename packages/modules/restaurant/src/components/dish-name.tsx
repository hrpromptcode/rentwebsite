import * as React from "react";

/**
 * Common Thai dish compounds that must never split at a line end ("แกงเขียว | หวานไก่บ้าน" → "แกงเขียวหวาน | ไก่บ้าน").
 * The kit segmenter knows loanwords, not food compounds, and dish names come from the tenant's menu.
 */
const FOOD_COMPOUNDS = [
  "เขียวหวาน", "ไก่บ้าน", "ปลากะพง", "กุ้งแม่น้ำ", "น้ำปลา", "ต้มยำ", "ต้มข่า", "ข้าวเหนียว", "มะม่วง", "ส้มโอ", "ส้มตำ", "กะพง", "แม่น้ำ", "ผัดไทย",
  "กะเพรา", "กระเพรา", "ข้าวผัด", "ข้าวซอย", "ข้าวมัน", "มัสมั่น", "พะแนง", "น้ำพริก", "ปลาหมึก", "หมูกรอบ", "หมูสับ", "ทอดมัน",
  "วุ้นเส้น", "แกงส้ม", "แกงป่า", "ซีอิ๊ว", "ราดหน้า", "ก๋วยเตี๋ยว", "บะหมี่", "ขนมจีน", "ไอศกรีม", "ชาไทย", "ชาเย็น", "มะพร้าว",
  "ใบเตย", "น้ำตก", "คอหมู", "ไข่ดาว", "ไข่เจียว", "ผักบุ้ง", "กุ้งสด", "ปลาทู", "ลอดช่อง", "สามชั้น", "หน่อไม้", "ตะไคร้",
].sort((a, b) => b.length - a.length);
const COMPOUND_RE = new RegExp(`(${FOOD_COMPOUNDS.join("|")})`, "g");
const COMPOUND_SET = new Set(FOOD_COMPOUNDS);
const THAI = /[\u0E00-\u0E7F]/;

/**
 * Dish name for headings: food compounds become nowrap units with a <wbr> before / after them; the rest keeps the browser's
 * own Thai breaking. Pure string work (no Intl.Segmenter), so it is safe in client components — server and client render
 * the same markup. Text content is unchanged (getByText / accessible names).
 */
export function DishName({ name }: { name: string }) {
  if (!THAI.test(name)) return <>{name}</>;
  const parts = name.split(COMPOUND_RE).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const next = parts[i + 1];
        const wbr = next && THAI.test(part.charAt(part.length - 1)) && THAI.test(next.charAt(0)) ? <wbr /> : null;
        return (
          <React.Fragment key={i}>
            {COMPOUND_SET.has(part) ? <span className="whitespace-nowrap">{part}</span> : part}
            {wbr}
          </React.Fragment>
        );
      })}
    </>
  );
}
