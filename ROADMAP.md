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
- [ ] Re-upload real templates after the PDF fix (old uploads keep the placement bug)
- [ ] "Needs a witness" flag on templates, shown in the UI (legal: CLAUDE.md §17)
- [ ] Template preview / rename / replace PDF without losing fields

## Phase 2 — Sending contracts ✅
- [x] 3-step wizard: choose template → tenant details → review & send
- [x] Live PDF preview with data boxes filled (AU formats `$350.00`, `01/12/2026`); warns about blank boxes
- [x] Prefill data boxes by Documenso field ID (verified on live API)
- [x] `/envelope/use` sent as multipart with JSON `payload` (per spec)
- [x] Optional email subject + message
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

## Phase 6 — Dashboard & contract tracking (next) ⬜
Goal: match the PandaDoc report (Created / Sent / Viewed / Completed / close rate).
- [ ] Summary cards: Created, Sent, Viewed, Completed, Close rate (completed ÷ sent) with date range picker
- [ ] Funnel Sent → Viewed → Completed; weekly sent/completed chart; average time to sign
- [ ] Analytics endpoint computed from the `events` table
- [ ] Contracts list: status tabs (All / Draft / Sent / Viewed / Completed / Cancelled-Expired), search (name, email, address), sort
- [ ] Contract page: timeline (Created → Sent → Opened → Signed → Copy emailed), clear status badges (`archived` shown as "Completed")
- [ ] **Download** signed PDF and certificate (backend endpoint via short-lived signed URL + button)

## Phase 7 — PandaDoc parity extras ⬜
- [ ] Automatic reminders from our email (e.g. day 2 and day 5 if unsigned) — scheduled job
- [ ] Expiry (e.g. 14 days) via Documenso `envelopeExpirationPeriod`; show "Expired"; handle `RECIPIENT_EXPIRED`
- [ ] Staff notification email when a tenant signs (or opens) — **(ask)** who receives it
- [ ] Cancel / void a sent contract (`POST /envelope/cancel`)
- [ ] Duplicate a contract (renewal or fix a mistake)
- [ ] Multiple signers: co-tenant, Living High rep, signing order — **(ask)** do contracts need this? Changes templates + sending

## Phase 8 — Security & access (must have before launch) ⬜
- [ ] **Staff login** (sessions; username/password or Google SSO) — nothing accessible without logging in
- [ ] Record who did what (`created_by` = logged-in user, not "staff")
- [ ] Lock down CORS to the production domain
- [ ] Role-based access (admin / property manager / read-only) — **(ask)**

## Phase 9 — Reliability ⬜
- [ ] Nightly reconcile: for non-final contracts, poll `GET /envelope/{id}`, fix status, archive + email if missed
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
- [ ] **Commit work to git** — everything since the first commit is uncommitted
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

## Open questions for the user
1. Do contracts need a second signer (co-tenant / Living High rep)?
2. Which real inbox should tenant replies go to (`EMAIL_REPLY_TO`)?
3. Who gets staff notifications when a tenant signs?
4. Staff login: simple username/password, or Google sign-in with Living High accounts?
5. Hosting preference for deploy (Railway/Fly.io + Vercel/Netlify)?
