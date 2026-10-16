// Appends one finding (JS object literal on stdin) as a JSON line to security.jsonl
import { readFileSync, appendFileSync } from "node:fs";
const src = readFileSync(0, "utf8");
const obj = (0, eval)("(" + src + ")");
for (const k of ["id","severity","confidence","bucket","title","where","actual","evidence"]) if (!obj[k]) throw new Error("missing " + k);
appendFileSync(new URL("./security.jsonl", import.meta.url), JSON.stringify(obj) + "\n");
console.log("logged", obj.id);
