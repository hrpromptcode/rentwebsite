import "../../load-env";
import { sql, getAdminDb } from "@rentweb/db";
/** Ad-hoc SQL for the topup_admin bughunt: tsx qa/bughunt/topup_admin-sql.ts "select ..." */
const s = process.argv[2];
if (!s) throw new Error("sql arg required");
getAdminDb().execute(sql.raw(s)).then((r) => { console.table(Array.isArray(r) ? r : (r as any).rows ?? r); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
