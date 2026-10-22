import { splitWords } from "../../../packages/ui/src/motion/split";
const seg = new Intl.Segmenter("th", { granularity: "word" });
for (const s of ["ห้องบีชฟรอนต์วิวทะเล", "ดนตรีโฟล์กกลางแจ้ง", "เวิร์กช็อปงานไม้", "เริ่มจากไอเดียเล็ก ๆ", "สตูดิโอซอฟต์แวร์", "ฟาร์มสเตย์ริมเขา", "พูลวิลล่าหน้าหาด", "สุขภาพดีเจริญอาหาร", "แซลมอนซาชิมิ", "Maker Yard — โกดังเก่า", "ฮาร์ดแวร์และซอฟต์แวร์"]) {
  console.log(s, "\n  icu :", [...seg.segment(s)].map((x) => x.segment).join("|"), "\n  kit :", splitWords(s).join("|"));
}
