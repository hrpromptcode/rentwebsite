# Admin app progress

## DONE
- Scaffold (next.config, tailwind, fonts), Better Auth (lib/auth*.ts, api route, proxy.ts), /login /signup /logout
- /onboarding wizard (3 steps, provisionTenant)
- /t/[slug] layout + AppShell (sidebar/Sheet, tenant switcher, user menu), role gating (lib/tenant.ts)
- /dashboard (KPIs, onboarding checklist, activity), /design (theme editor), /pages + /pages/[id] (section editor, auto-form), /navigation, /media, /customers + /customers/[id]
- Module placeholder catch-all [...rest]
- console/actions.ts (impersonate, plan, status, trial)

## REMAINING
- [x] /t/[slug]/settings (general, payments, domains, team, billing, danger) + /invite/[token] accept page
- [x] /console layout + pages (overview stats, tenants table, tenants/[id], templates, plans)
- [x] tooling/create-admin.ts + script entry; admin@rentweb.local / Admin1234! created (superadmin, owner of 7 demo tenants)
- [x] Fixed auth-config generateId (was "uuid" string → DEFAULT id insert failed)
- [x] tooling/admin-screenshot.ts written (run pending)
- [ ] Start dev server 3001, verify, screenshots, fix layout
