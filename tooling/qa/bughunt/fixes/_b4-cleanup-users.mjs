import { db } from "../security-http.mjs";
const sql = db();
const pattern = process.argv[2];
if (!pattern || !pattern.startsWith("qa-b4-")) throw new Error("pattern must start with qa-b4-");
const users = await sql`select id, email from "user" where email like ${pattern}`;
for (const u of users) { await sql`delete from session where user_id = ${u.id}`; await sql`delete from account where user_id = ${u.id}`; await sql`delete from tenant_members where user_id = ${u.id}`; await sql`delete from "user" where id = ${u.id}`; }
console.log("deleted", users.map((u) => u.email));
await sql.end();
