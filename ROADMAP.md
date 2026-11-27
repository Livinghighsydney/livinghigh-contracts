# ROADMAP — Living High Contract Signing System

The single list of what is built and what is left. **Tick items here when they are done** (`[x]` + date) and keep `CLAUDE.md` §13 in sync.

Legend: `[x]` done · `[ ]` to do · `[~]` partly done · **(ask)** = confirm with the user before building

Last updated: 2026-11-26

---

## Phase 0 — Foundation ✅
- [x] MVC backend (FastAPI + Tortoise) and React/Vite/Tailwind frontend scaffold
- [x] Neon PostgreSQL connected, tables created, startup migrations (`ALTER TABLE … IF NOT EXISTS`)
- [x] Supabase Storage: private `contracts` bucket created (2026-11-26), upload / download / signed URL / delete
- [x] All Documenso calls isolated in `documenso_client.py`, retry on 429/5xx, friendly `DocumensoError`
- [x] Health check `GET /health`
- [x] Real `DOCUMENSO_WEBHOOK_SECRET` set in `.env` and Documenso dashboard (2026-11-26)
- [x] Supabase CORS checked — signed URLs already allow browser access (2026-11-26)

## Phase 1 — Templates (PandaDoc-style editor) ✅
- [x] Upload PDF → Supabase + Documenso template with placeholder Tenant recipient
- [x] PDF normalised on upload (explicit MediaBox per page) — fixes A4 text landing low/right (2026-11-26)
- [x] Editor: right-hand field panel, drag & drop or click to add, move, resize, delete, arrow-key nudge
- [x] Two field groups: **Tenant fills in** (signature, initials, date, name, email, text) and **Filled from contract** (data boxes)
- [x] Save replaces Documenso fields (no duplicates) and stores `documensoFieldId` per field
- [x] At least one Signature required to save; unsaved-changes warning
- [x] All PandaDoc field types Documenso supports: + Number, Checkbox, Radio buttons, Dropdown (2026-11-26, verified on live API)
- [x] Field settings panel: label, placeholder, required on/off, font size, alignment, character limit, min/max, options, pre-selected option, layout (stacked / in a row) (2026-11-26)
- [x] Editor: multi-select (shift-click, Ctrl+A), move together, duplicate (Ctrl+D), copy/cut/paste (Ctrl+C/X/V), bulk required/optional (2026-11-26)
- [x] Same data box can be placed several times (each copy is filled) (2026-11-26)
- [ ] Not possible with Documenso (skip unless we build our own): file uploads ("Collect files"), conditional fields, linked tenant fields, mask data. Card details / Stamp are out of scope.
- [ ] Re-upload real templates after the PDF fix (old uploads keep the placement bug)
- [ ] "Needs a witness" flag on templates, shown in the UI (legal: CLAUDE.md §17)
- [ ] Template preview / rename / replace PDF without losing fields

## Phase 2 — Sending contracts ✅
- [x] 3-step wizard: choose template → tenant details → review & send
- [x] Live PDF preview with data boxes filled (AU formats `$350.00`, `01/12/2026`); warns about blank boxes
- [x] Prefill data boxes by Documenso field ID (verified on live API)
- [x] `/envelope/use` sent as multipart with JSON `payload` (per spec)
- [x] Optional email subject + message
- [~] Australian date format (dd/MM/yyyy) + Australia/Sydney timezone sent on every contract — code done, live check blocked by Documenso 429 (re-check on next real send)
- [x] Save as draft; retries reuse the draft (no duplicate contracts)
- [x] Clear validation and error messages (no `[object Object]`)

## Phase 3 — Emails from our own domain ✅
- [x] Documenso sends **no** emails (`distributionMethod: NONE`, all `emailSettings` false) — verified live
- [x] Email 1: signing request with personal `signingUrl`, from `contracts@livinghigh.com.au`
- [x] Email 2: signed copy (PDF attached) after completion
- [x] Resend SMTP connected (`smtp.resend.com`, user `resend`, API key as password) — login verified 2026-11-26
- [x] "Resend email" button (signing link if unsigned, signed copy if completed)
- [ ] Set `EMAIL_REPLY_TO` to a real inbox (tenant replies otherwise go to contracts@, which is not a mailbox)
- [ ] First real email received from Living High (click Resend on the alex jordan test contract)

## Phase 4 — Webhooks & archive ✅
- [x] Event names fixed to `DOCUMENT_*` (were `ENVELOPE_*` — statuses never updated before 2026-11-26)
- [x] Secret verified; rejected when missing/wrong
- [x] Status only moves forward; duplicates safe; per-contract lock
- [x] On completion (background task): download signed PDF + certificate → Supabase with SHA-256 → `archived` → email signed copy
- [x] Audit events store no personal data
- [x] Back-filled the first real test contract (alex jordan) → archived, files stored

## Phase 5 — End-to-end test 🔶 (in progress)
- [x] First full run: template → send → tenant signed on phone → certificate produced (2026-11-26)
- [ ] Second run with all fixes: re-uploaded template, email from Living High, text placement correct, signed copy received, status `archived`
- [ ] Test on a real Living High tenancy form (not the generated test PDF)

---

## Phase 6 — New frontend (Lovable) + dashboard ✅ (2026-11-26)
- [x] Lovable-built frontend (React 19 + TanStack Start) replaced the old one; same code, wired to our backend
- [x] Real data everywhere via cached API layer (`frontend/src/api/`), auto-refresh every 30s and on focus
- [x] Dashboard: Created / Sent / Viewed / Completed / close rate, date ranges, funnel, 4-week trend, average time to sign
- [x] Contracts list: status tabs, search, sort, pagination
- [x] Contract page: real timeline, resend, **cancel** (Documenso `/envelope/cancel`), duplicate, **download signed PDF + certificate** (short-lived Supabase links)
- [x] Backend: `GET /api/contracts/overview`, `POST /{id}/cancel`, `GET /{id}/files/{kind}`, `GET /api/templates/{id}/pdf`, `GET /api/settings/`, configurable `CORS_ORIGINS`
- [x] Verified in headless Chrome: all pages load real data with no errors; tests 18/18; production build OK
- [x] NUMBER / CHECKBOX / RADIO / DROPDOWN + field settings (required, placeholder, options, pre-selected, layout, font size, align, character limit, min/max) added to the new editor (2026-11-26)
- [x] **Staff-chosen fields** (2026-11-26): Checkbox / Radio / Dropdown / Text / Number under "Filled from contract → Staff choose when sending". Staff answer them on New Contract step 2 ("Agreement options"); stored in `contracts.custom_values`; validated against the template; prefilled into Documenso and locked (read-only) for the tenant. Template save verified live; prefill of checkbox/radio/dropdown/number not yet confirmed live (Documenso 429) — confirm on the next real send
- [x] **Tick box** field (2026-11-26): box-only CHECKBOX (`tickOnly`) placed exactly over a box printed on the PDF (min size reduced to fit 4 mm). Tenant tick box = tenant ticks when signing. Staff tick box = `group` (question) + `optionLabel` (what the box means) + `groupMode` one/any; staff answer each question once on New Contract (`custom_values["group:<question>"]`); only chosen boxes are prefilled (`{type: checkbox, value: [""]}`). Prefill not yet confirmed live (Documenso 429) — confirm on next real send
- [x] New Contract asks only for the details the template prints (tenant name + email always). `weekly_rent`, `bond_amount`, `start_date` nullable; backend requires a detail only when the template uses its data box (2026-11-26)
- [x] New Contract **mirrors the template** (2026-11-27): one list in document order with the template's own labels (e.g. "Occupancy fee", not "Weekly rent"), pre-selected options + placeholders carried over, review step + contract page show the same list, backend drops details the template doesn't print, templates refresh live when saved. Tests: `src/test/contract-form.test.ts`
- [x] Info Sys template fields placed (2026-11-27): 15 fields (page 1 details/staff choices, page 7 tenant). Open: second "Minimum stay" blank meaning; "[Document.CreatedDate]" leftover text; ID upload (needs our own page)
- [x] Tick box "Show text on document" (`showText`) and radio/checkbox button size follows the box (`choice_font_size`) (2026-11-27)
- [x] **PandaDoc-style field panel** (2026-11-27): one set of field types with a **"Filled by: Tenant / Staff (before sending)"** picker (like PandaDoc roles) + Filled-by switch on each placed field; "Contract details" group for auto-filled data
- [x] **Dropdown editor** (2026-11-27): answer choices with reorder, paste-a-list (one per line), ready-made lists (Yes/No, Weeks/Months, 1–12, notice period, deposit weeks, minimum stay), placeholder, pre-selected answer, required
- [x] **Linked staff fields** ("Same answer as…", like PandaDoc Copy-and-link): staff answer once, printed in every linked place; linked fields share choices (`linkTo`)
- [x] **"Tenant can change the answer"** for staff fields (`tenantEditable` → Documenso `readOnly: false`)
- [x] Demo template for testing: `backend/generate_demo_template.py` → `demo_tenancy_agreement.pdf` (no placeholder text, tick boxes, initials boxes) (2026-11-26)
- [x] Removed the "Sample sign-in" notice — real login exists (2026-11-26)
- [ ] Delete leftover `_lovable/` folder (locked by Windows during the swap) and `ront.zip` when convenient

## Phase 7 — PandaDoc parity extras ⬜
- [ ] Automatic reminders from our email (e.g. day 2 and day 5 if unsigned) — scheduled job
- [ ] Expiry (e.g. 14 days) via Documenso `envelopeExpirationPeriod`; show "Expired"; handle `RECIPIENT_EXPIRED`
- [ ] Staff notification email when a tenant signs (or opens) — **(ask)** who receives it
- [x] Cancel / void a sent contract (`POST /envelope/cancel`) (2026-11-26)
- [x] Duplicate a contract (renewal or fix a mistake) (2026-11-26)
- [ ] Multiple signers: co-tenant, Living High rep, signing order — **(ask)** do contracts need this? Changes templates + sending

## Phase 8 — Staff login, roles & team ✅ (2026-11-26)
- [x] Real login: email + password (scrypt hashes), server-side sessions in an HttpOnly cookie, 14-day expiry, logout, login rate limit (10 tries / 15 min)
- [x] Roles same as PandaDoc: **Admin** (everything) · **Manager** (all contracts + templates, invites Members/Managers) · **Member** (own contracts only)
- [x] Account owner = seeded super admin `contracts@livinghigh.com.au` — can't be demoted/deactivated (no lock-out)
- [x] `backend/seed.py` (idempotent): tables, super admin (password from `SEED_ADMIN_PASSWORD` in .env), backfills contract owners
- [x] Team page (same Lovable UI): members, role change, deactivate/reactivate (signs out at once), transfer contracts, pending invites (resend / cancel)
- [x] Invite by email from Living High (Resend), link valid 5 days, accept page sets name + password and signs in
- [x] Change password in Settings (signs out other devices)
- [x] Every API route requires login except health, webhooks, login and invite links; contracts filtered by owner for Members
- [x] Verified: 27/27 permission checks (backend), headless browser check of login, team, settings, invite pages
- [ ] Forgot-password email (self-service reset) — today an Admin can't reset passwords; ask before building
- [ ] Production cookie settings when frontend/backend are on different domains: `COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`, set `FRONTEND_URL` + `CORS_ORIGINS`
- [ ] Change the seeded super admin password after first login (Settings → Change password)

## Phase 9 — Reliability ⬜
- [x] **Live updates over WebSocket** (2026-11-27): `/api/live` (session cookie + origin check); every contract change (webhook, sent, queued, archived…) is pushed to signed-in browsers that may see it; the frontend refreshes instantly. No polling (30s refresh removed)
- [x] **Catch-up with Documenso** (2026-11-27): once at backend start-up (`catch_up_on_start`) + "Check status now" button (`POST /api/contracts/{id}/sync`) — fixes contracts whose webhooks were missed. No periodic polling (user decision)
- [x] Incident 2026-11-27: Ajaz Gyle signed but webhook lost (tunnel down) → catch-up archived it and emailed the signed copy
- [x] Send queue for Documenso's document limit (2 new documents / ~5 min): contracts become **Queued** and are sent automatically when allowed; timeline + notice on the contract page; queued contracts can be cancelled (2026-11-26)
- [x] Documenso upgraded to Teams (2026-11-27); the queued contract was sent automatically. Re-check `x-ratelimit-limit` on `/envelope/use` on the next send
- [x] Replaced by start-up catch-up + manual "Check status now" (no polling, per user)
- [ ] Retry failed signed-copy emails (events `email.completed_copy_failed`)
- [ ] Error alerting (free option, e.g. email to admin on repeated failures) — **(ask)** if it needs a paid service

## Phase 10 — Tests ⬜
- [ ] Webhooks: bad/missing secret, duplicates, out-of-order events, unknown envelope
- [ ] Status transitions and archive idempotency
- [ ] Prefill mapping + AU formatting; template field → Documenso mapping
- [ ] Email building (escaping, attachments) with SMTP mocked
- [ ] PDF normalisation

## Phase 11 — Deploy ⬜ **(ask: hosting choice)**
- [ ] Backend host (e.g. Railway / Fly.io) and frontend host (e.g. Vercel / Netlify) — free/cheap tiers
- [ ] All env vars set in hosting; HTTPS; production CORS
- [ ] Documenso webhook URL → production backend (replace the temporary cloudflared tunnel)
- [ ] Scheduled jobs running (reconcile, reminders)

## Phase 12 — Docs & handover ⬜
- [ ] Refresh `docs/` (setup, env-vars, runbook, templates are out of date — e.g. runbook still says resend from Documenso)
- [ ] How to add a template (staff guide with screenshots)
- [ ] Runbook: tenant never got the email (Resend dashboard + Resend button), status stuck, PDF missing
- [ ] How to rotate keys (Documenso, Resend, Supabase)
- [ ] Handover doc for the client

## Later / nice to have **(ask before building)**
- [ ] GoHighLevel CRM integration
- [ ] Bulk send (one template → many tenants from CSV) for renewals
- [ ] Tenant uploads (ID, payslips)
- [ ] Import PandaDoc history into the dashboard

---

## Housekeeping
- [x] Real production agreements added in `docs/agreements/` (2026-11-27). `Lodgers Agreement - Fresh Rooms bank details.pdf` is a SIGNED contract with real tenant data — git-ignored, never commit or upload
- [x] 429 debugged (2026-11-26): `/envelope/use` allows 2 new documents per ~5 min (`x-ratelimit-limit: 1000, 2`) — handled by the send queue
- [x] Retry no longer waits more than 10s on 429; staff see "Documenso is busy, try again in a few minutes" (2026-11-26)
- [ ] Remove test template "ZZ Claude field test" (has one of every field type — useful demo until then)
- [x] Work committed and pushed by the user (2026-11-26)
- [ ] Remove test templates "ZZ Claude API test 2" (and its Documenso template) once real templates exist
- [ ] Old broken template `tenancy_standard` (no PDF, no recipient) is still active — deactivate it
- [ ] Backend runs without `--reload` (auto-reload missed changes on Windows) — restart after code changes
- [x] `.env.example` has all variables incl. SMTP (2026-11-26)

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-26 | Field editor modelled on PandaDoc: admin sets up fields once per template; staff only fill a form |
| 2026-11-26 | All tenant emails sent from Living High's domain via Resend SMTP; Documenso sends none |
| 2026-11-26 | Data boxes are read-only TEXT fields in Documenso, prefilled by field ID |
| 2026-11-26 | Template PDFs normalised (explicit page boxes) before upload |
| 2026-11-26 | Tenant-only signer for now; multiple signers pending user answer |
| 2026-11-26 | Staff login = email + password, roles Admin / Manager / Member (PandaDoc names); Members see only their own contracts |

## Open questions for the user
1. Do contracts need a second signer (co-tenant / Living High rep)?
2. Which real inbox should tenant replies go to (`EMAIL_REPLY_TO`)?
3. Who gets staff notifications when a tenant signs?
4. ~~Staff login type~~ — decided: email + password with PandaDoc-style roles (2026-11-26)
5. Hosting preference for deploy (Railway/Fly.io + Vercel/Netlify)?
