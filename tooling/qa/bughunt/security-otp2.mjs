import { actionId, callWebAction, TENANTS } from "./security-http.mjs";
const host = "demo-shop.localhost:3000", target = "0899990002";
const req = await callWebAction(host, "", actionId("requestOtpAction", "account"), [TENANTS.shop, { step: "target" }, "$K1"], "/account/login", { target });
const code = req.text.match(/"devCode":"(\d{6})"/)?.[1];
const v = await callWebAction(host, "", actionId("verifyOtpAction", "account"), [TENANTS.shop, "//evil.example/x", { step: "code", target }, "$K1"], "/account/login?next=%2F%2Fevil.example%2Fx", { target, code });
console.log("verify with next=//evil.example/x ->", v.status, "redirect:", v.location);
process.exit(0);
