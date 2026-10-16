import { randomBytes } from "node:crypto";
import { creds, saveCreds, signUp, signIn } from "./security-http.mjs";
const c = creds();
for (const key of ["u1", "u2"]) {
  if (!c[key]) {
    c[key] = { email: `sec-${key}-${randomBytes(3).toString("hex")}@example.test`, password: randomBytes(9).toString("base64url") };
    const r = await signUp(c[key].email, c[key].password, `SEC ${key}`);
    console.log(key, "signup", r.status, r.body.slice(0, 120));
  }
  const s = await signIn(c[key].email, c[key].password);
  c[key].cookie = s.cookie;
  console.log(key, "signin", s.status, s.cookie ? "cookie ok" : "NO COOKIE");
}
const a = await signIn("admin@rentweb.local", "Admin1234!");
c.admin = { cookie: a.cookie };
console.log("admin signin", a.status);
saveCreds(c);
