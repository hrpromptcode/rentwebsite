import { ADMIN, actionId, callAction, creds, saveCreds } from "./security-http.mjs";
const c = creds();
for (const [key, slug, template] of [["u1", "sec-u1shop", "shop"], ["u2", "sec-u2rest", "restaurant"]]) {
  const r = await callAction(ADMIN, c[key].cookie, actionId("createSiteAction", "onboarding"), [{ template, name: `SEC ${key} site`, slug, preset: "aurora" }], "/onboarding");
  console.log(key, r.status, r.location, r.text.slice(0, 160).replace(/\n/g, " | "));
  c[key].slug = slug;
}
saveCreds(c);
