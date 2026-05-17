# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ClaimRidge is an AI insurance compliance layer for the MENA market (Jordan-first, then UAE/KSA). It connects three user types — providers (hospitals/clinics), doctors, and insurers — across two distinct workflows:

- **Pre-authorisation** (prospective): provider asks the insurer to greenlight a planned procedure. There is **no AI step** — the insurer's medical team reviews medical necessity against their policy and decides manually. On approval, the system issues an `authorization_number` valid for a configurable window.
- **Claims** (retrospective): provider files a bill *after* service. AI runs coding/billing scrubbing + statistical fraud detection. Claims that reference a pre-auth get verified against the auth's window, patient identity, and approved procedure scope.

Fraud detection (XGBoost + structured bilingual case files) runs on **claims only**, and is scored **insurer-side during adjudication** — never at provider submission. The pre-auth pipeline runs **no AI at all** — not fraud scoring, not medical-necessity review, not even an advisory recommendation. It only OCRs the submitted documents and extracts structured fields to pre-fill the request; the insurer then decides every pre-auth manually.

The repo is a monorepo with two apps: `backend/` (FastAPI + Supabase + ML) and `frontend/` (Next.js 14 App Router). They are deployed/run independently and only meet over HTTP + a shared Supabase database.

## Common commands

Backend (run from `backend/`):

```powershell
# Install deps (no requirements pin file is locked; use a venv)
pip install -r requirements.txt

# Dev server (FastAPI on :8000 by default)
uvicorn main:app --reload
```

Frontend (run from `frontend/`):

```powershell
npm install
npm run dev      # Next dev server on :3000
npm run build
npm run start
npm run lint     # next lint (eslint-config-next)
```

There is no test suite in either app.

## Environment

Backend reads `.env` from `backend/.env` (loaded in `core/config.py`). Required vars:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase admin client (used server-side; do **not** confuse with the anon key the frontend uses).
- `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY` — multi-provider LLM access via LangChain.
- Optional: `LLM_MODEL` (default `llama-3.3-70b-versatile`), `OCR_MODEL` (default `baidu/qianfan-ocr-fast:free`).

Frontend uses standard Next.js public env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for the browser/SSR Supabase clients in `src/lib/supabase/`. The frontend talks to the FastAPI backend via `NEXT_PUBLIC_BACKEND_URL`.

## Database / Migrations

Schema is in `backend/database.sql` (context-only, not a migration). To install on a fresh Supabase project, run the migrations in `backend/migrations/` in numeric order:

- `002_clean_reset.sql` — drops + recreates the base ClaimRidge tables.
- `004_claims_rls.sql` — claims-side RLS policies.
- `005_doctor_onboarding_and_fraud_switch.sql` — adds `doctor_join_requests`, `fraud_cases`, plus claim fraud columns (`fraud_score`, `fraud_risk_level`, `fraud_flags`, `fraud_case_id`) and routing columns on both `pre_auth_requests` and `claims` (`routing_status`, `payer_name_raw`, `submitted_by`).
- `006_authorization_linkage.sql` — adds `pre_auth_requests.authorization_number / valid_until / approved_procedures / issued_at` and `claims.pre_auth_id / pre_auth_number / auth_check_status / auth_check_detail`.
- `007_drop_invitations.sql` — drops the deprecated `doctor_invitations` table (email invitations were prototyped then removed; will return with real email delivery later).
- `008_pre_auth_structured_fields.sql` — adds the structured pre-auth packet columns to `pre_auth_requests` (patient demographics — `patient_dob`, `insurance_member_id`, etc.; ordering/servicing provider name+NPI+Tax ID; `diagnosis_codes` / `procedure_codes` jsonb arrays; `modifiers`, `ndc_code`, `place_of_service`, `anticipated_date_of_service`, `priority`, `submitted_role`) plus an index on `submitter_org`.
- `009_audit_compliance.sql` — Audit Trail & Compliance. Turns `audit_log` into an **append-only, hash-chained** event spine (`chain_seq`/`prev_hash`/`event_hash`/`category`/`tenant_id`/`metadata`; a `block_mutation` trigger forbids UPDATE/DELETE on both `audit_log` and `ai_inference_log`); drops FKs whose cascades would mutate those immutable tables; makes `ai_inference_log` usable for any AI call (drops the one-target CHECK, adds `prompt_text`/`actor_id`/`tenant_id`); adds `retention_until` to `claims`/`pre_auth_requests`/`pre_auth_documents`; adds the `erasure_requests` table.
- `010_claim_adjudication.sql` — Claim Adjudication. Adds `claims.adjudication` (jsonb verdict), `claims.adjudication_decision` (`accept` | `deny` | `escalate`), and `claims.adjudicated_at` (the cache marker — its presence means adjudication has run). The verdict is produced when an insurer first opens a routed claim; see `services/adjudication.py`.
- `014_pre_auth_remove_ai_decision.sql` — Pre-auth no longer has any AI step. Drops `pre_auth_requests.ai_decision` / `ai_rationale` and re-homes any leftover `processing` rows to `pending`. (Migrations `011`–`013` also exist on disk and should run in numeric order.)
- `015_claim_fraud_signal.sql` — Adds `claims.fraud_signal` (jsonb). The claim form's fraud-model signal is captured here at submission so the XGBoost model can be run later, insurer-side, inside adjudication (it no longer runs at provider submission).
- `016_account_waitlist.sql` — Account waitlist. Recreates `waitlist_requests` with the shape the app writes (`email`, `password`, `account_type`, `details` jsonb, `status` `pending`|`approved`|`rejected`, `reviewed_by`/`reviewed_at`) and adds `profiles.approved`. Organisations (provider/insurer) apply via the signup form — **no auth account or tenant row is created until an admin approves**; the request just sits in `waitlist_requests`. Approval (`POST /api/user/waitlist/{id}/approve`, admin-only) transactionally creates the auth user + `insurers`/`provider_orgs` row + `profiles` row; rejection leaves nothing behind. RLS is enabled on `waitlist_requests` with no policies (it holds plaintext credentials) so only the service-role backend can touch it — the admin page reads it via `GET /api/user/waitlist`, never the browser client. Doctors are unaffected (direct signup + join-by-code).

The older `001_add_provider_side.sql` and `003_cleanup_orphans.sql` exist for historical migrations from the legacy single-app model and don't need to run on a fresh install.

## Architecture

### Cross-cutting

- **Supabase is the single source of truth.** Both apps talk to the same Postgres directly — there is no internal API layer between the frontend and DB for read paths. The FastAPI backend is invoked for AI-heavy write paths (document OCR, pre-auth evaluation, claim scrubbing + fraud, policy embedding, policy chat). The schema lives in `backend/database.sql` (context-only).
- **Auth is Supabase JWT.** `core/security.py:get_current_user` verifies bearer tokens via `supabase.auth.get_user(token)`. Routers resolve the caller's profile and scope queries by either `insurer_id` (insurer staff), `provider_org_id` (provider admins), or `user_id` / `doctor_org_links` (doctors).
- **Multi-tenancy:** every authenticated endpoint must look up the caller's profile and constrain Supabase queries by the appropriate tenant id. Bugs that leak data across tenants look like missing `.eq("insurer_id", …)` / `.eq("payer_id", …)` filters.
- **Authorization linkage (the cross-cutting workflow):** approving a pre-auth (always a manual insurer-reviewer decision) issues an `AUTH-YYYYMMDD-XXXXXXXX` number with a 90-day default validity (overridable per insurer via `insurers.config.pre_auth_validity_days`). When a claim is submitted with that number, `services/authorization.py:verify_authorization` checks (a) auth exists for this insurer, (b) within validity window, (c) patient identity matches, (d) at least one billed procedure code overlaps `approved_procedures`. The verdict persists on `claims.auth_check_status` (`ok` | `missing` | `expired` | `wrong_patient` | `code_mismatch` | `not_applicable`) and is fed into the claim scrubber prompt so the LLM raises an `error`-severity issue on broken linkage.
- **Claim LLM prompts (claims-only):** `SCRUB_SYSTEM_PROMPT` does coding/billing review (CPT↔ICD alignment, NCCI bundling, upcoding, modifiers, fee schedule) and is auth-aware via the `auth_check_summary` block; `ADJUDICATION_SYSTEM_PROMPT` produces the separate accept/deny/escalate verdict. **Pre-auth has no LLM prompt** — its medical-necessity review was removed; the insurer decides every pre-auth manually.

### Backend (`backend/`)

FastAPI app composed of routers + services. `main.py` registers the routers below. CORS is open `*`.

Routers:

- `routers/pre_auth.py` — insurer-side queue + manual decision (`GET /api/pre-auth/queue`, `POST /api/pre-auth/{id}/review`). Manual approval issues an authorization via `services/authorization.issue_authorization`; deny/escalate revokes any previously-issued auth.
- `routers/dropoff.py` — pre-auth submission. Anonymous public form at `POST /api/dropoff/`; authenticated variant at `POST /api/dropoff/provider` (used by both providers and doctors — carries the structured pre-auth packet: demographics, ordering/servicing provider, ICD-10/CPT arrays, place of service, priority; handles out-of-network "unrouted" mode where `payer_id IS NULL` and document processing is skipped); per-submitter list at `GET /api/dropoff/my-submissions`. `POST /api/dropoff/extract` (mirrors `/api/claims/extract`) takes dropped-off documents and returns a structured pre-auth packet with per-field `{value, confidence}` so the form can be auto-filled before review. Submitter-entered structured fields are authoritative — `ai_services.process_pre_auth_case` only extracts from documents to fill columns left blank.
- `routers/claims.py` — provider-facing claim submission, a **two-step flow**. `POST /api/claims/scrub` is a **preview**: it runs `verify_authorization` + the auth-aware AI scrubber and returns the suggestions **without persisting anything** (no claim row, no audit). `POST /api/claims/submit` is the **commit**: it persists the claim, captures the XGBoost `fraud_signal` (the model is **not** run here — fraud scoring is insurer-side, in adjudication), and writes the audit trail. The provider reviews the scrub preview, then either edits the claim or confirms it. `submit` accepts the previewed `scrub_result` so it is stored as reviewed; the auth check is always recomputed server-side. Pre-auth preview lookup at `GET /api/claims/pre-auth-lookup/{auth_number}` powers the claim form's live preview.
- `routers/insurer.py` — policy upload + embedding (`POST /api/insurer/process-policy`), policy delete (`DELETE /api/insurer/policy`), legacy claim review/analyze, and **claim adjudication** (`POST /api/insurer/claims/{id}/adjudicate` — the automatic accept/deny/escalate verdict; `?force=true` re-runs a cached one). The insurer claim-detail page fires this on first open.
- `routers/fraud.py` — generates structured `FraudCaseFile` for flagged **claims** (`POST /api/fraud/generate-case`, takes `claim_id`). Persists via `services/case_engine.persist_fraud_case`.
- `routers/providers.py` — provider admin endpoints: own org info (`/me`), doctor roster (`/doctors`), join-request approval queue (`/join-requests`, `/join-requests/{id}/decision`), and org-wide pre-auth governance (`GET /pre-auths` — every submission by the admin + affiliated doctors, scoped by `submitter_org`, with a per-doctor stats roll-up).
- `routers/doctors.py` — doctor join-by-code flow (`POST /api/doctors/join-by-code` creates a pending request, requires admin approval) and affiliation list (`GET /api/doctors/affiliations`).
- `routers/assistant.py` — the **Assistant**: a read-only, tool-using agent available to all three portals (`POST /api/assistant`, `GET /api/assistant/status`). `_resolve_caller` derives the caller's role + tenant scope; the LLM is bound a portal-specific set of tools, each hard-filtered to that scope — `search_policy_handbook` (insurer only, RAG over `policy_chunks`), `query_claims`, `query_flagged_claims`, `query_pre_auths`, `get_stats`, `query_network`, `get_record_detail`. Scope: insurer → their `insurer_id`/`payer_id` rows; provider → all org members' submissions; doctor → their own. Up to 6 tool hops; returns `{ answer, sources, tool_calls }` where every fact is cited `[#N]` and each source carries `{type,title,snippet,link?,similarity?}`. It is strictly read-only — it never mutates data. (Replaced the old single-tool `policy_chat.py`.)
- `routers/audit.py` — **Audit Trail & Compliance**, all three portals (tenant-scoped). `GET /events`, `GET /ai-inferences`, `GET /verify` (re-hashes the whole chain), `POST /pii-access` (pages call this when patient data is opened — there is no read-layer to intercept), `GET /retention`, `GET|POST /erasure` + `/erasure/{id}/execute` (anonymises the underlying claim/pre-auth — the log itself is never erased), `POST /export` (regulator CSV dataset). Every write goes through `services/audit.py`; this router is itself read-only except for erasure execution.
- `routers/intake.py`, `routers/user.py` — claim intake helpers and account-lifecycle (delete cascade).

Services (keep routers thin):

- `services/ai_services.py` — the claims pipeline plus pre-auth document processing. `process_pre_auth_case` OCRs a routed pre-auth's documents and extracts structured metadata into any blank columns — it runs **no** decision or recommendation LLM (pre-auth has no AI review). `scrub_claim` runs the coding-focused LLM with the auth-check summary baked into the prompt — it stays coding-only and does NOT decide accept/deny. `run_claim_adjudication_llm` is the separate adjudication LLM (`ADJUDICATION_SYSTEM_PROMPT`): it consumes the scrubber's coding issues + the fraud result + payer-policy RAG and returns the `accept`/`deny`/`escalate` verdict — invoked only by `services/adjudication.py` for low-fraud-risk, policy-backed claims. Auto-approve in `_persist_decision` calls `issue_authorization`. Embeddings come from `services/embeddings.py`, NOT `langchain_google_genai.GoogleGenerativeAIEmbeddings` (see below).
- `services/embeddings.py` — direct-HTTP wrapper around Gemini's v1beta `embedContent` endpoint. Required because (a) the langchain wrapper hits a `batchEmbedContents` endpoint that the project's available models don't expose, and (b) `gemini-embedding-001` defaults to 3072-dim output but `policy_chunks.embedding` is `vector(768)`. The wrapper passes `outputDimensionality: 768` (Matryoshka truncation). Implements `embed_documents` / `embed_query` so it slots into existing langchain-style call sites.
- `services/fraud_service.py` — Layer-1 XGBoost claim-fraud detector. Loads `models/production_fraud_model.xgb` + `models/production_label_encoders.pkl` + `models/feature_names.pkl` at import time. Threshold `70.0`, extreme threshold `90.0`. Invoked only by `services/adjudication.py` — fraud scoring is insurer-side and never runs at provider submission. Logs which model features carried real claim data vs. fell back to a default on every scoring run. Model paths resolve relative to `backend/` — always run with `backend/` as CWD or model loading silently fails (logs a warning, `model` becomes `None`).
- `services/pre_auth_fraud_service.py` — **no-op stub** for the future pre-auth fraud model. Always returns `low` risk. Swap the implementation when a real pre-auth model is trained — the call site in `ai_services.py:check_fraud_system` won't need to change.
- `services/case_engine.py` — generates the bilingual (EN+AR) `FraudCaseFile` (flag_type, severity, confidence, summaries, evidence, prioritised actions). `persist_fraud_case` writes to `fraud_cases` and back-links via `claims.fraud_case_id`. The engine reads from `claims`, NOT `pre_auth_requests`.
- `services/authorization.py` — issues authorization numbers (`issue_authorization`), revokes them on overturned approvals (`revoke_authorization`), and verifies claim ↔ auth linkage (`verify_authorization`). Idempotent — re-issuing on an already-authorised row returns the existing number.
- `services/adjudication.py` — **claim adjudication**: the automatic accept/deny/escalate verdict for a routed claim, produced the first time an insurer opens it (cached on the claim row; `force` re-runs). Pipeline: **run the XGBoost fraud model** (insurer-side — scoring happens here, not at provider submission; reads `claims.fraud_signal`, persists score/flags, and auto-generates a `FraudCaseFile` for `high`/`extreme`) → **fraud hard-gate** (`extreme` → auto-deny, `high` / `insufficient_data` → auto-escalate, `low` → continue) → **policy check** (a low-risk claim whose payer has no embedded policy → escalate) → **LLM adjudication** (`ai_services.run_claim_adjudication_llm`) for the remaining low-risk, policy-backed claims. Writes `claims.status` = `accepted` | `denied` | `escalated`. Note this is a *separate* vocabulary from the manual `review-claim` flow (`approved`/`rejected`/`needs_info`) — both can appear on `claims.status`.
- `services/code_lookup.py` — CPT/ICD-10 description lookup used by the pre-auth prompt.
- `services/audit.py` — the single write path for the append-only, hash-chained `audit_log`. `record_event` (every meaningful action — decisions, submissions, exports, deletions, erasure; **not** logins/page views), `record_ai_inference` (writes `ai_inference_log` + a spine event), `log_pii_access`, `verify_chain`. Pure/deterministic — it performs **no** AI calls, and never raises (auditing must not break the action it records).

LLM calls go through LangChain (`langchain_groq`, `langchain_google_genai`, `langchain-openai`). Vectors live in `policy_chunks.embedding` (pgvector, 768-dim). The `match_policy_rules` RPC powers RAG retrieval in both the pre-auth pipeline, the claim scrubber, and the policy chatbot.

### Frontend (`frontend/`)

Next.js 14 App Router, TypeScript, Tailwind. Three authenticated portals, each with its own layout + sidebar, plus a public drop-off and the auth routes:

- All three portals share **one sidebar pattern**: *Overview* (Dashboard, Assistant) → *Workflow* → *Network* → *Compliance* (Compliance & Audit), then pinned Settings / Sign Out. Shared items keep the same label and position across portals.
- `app/dashboard/insurance/` — insurer portal. *Workflow* = Pre-Auth Inbox, Claims Inbox, Fraud Detection; *Network* = Network Providers. Dashboard renders two parallel sections, **pre-auth first then claims** (consistent across all three dashboards) — pre-auth KPIs + decision-mix bar + priority inbox, and claims KPIs + 7-day twin-sparkline + recent claims — all from real Supabase queries. The Claims Inbox opens a claim by clicking anywhere on its row. The fraud page surfaces flagged claims and lets the reviewer generate a `FraudCaseFile` modal with bilingual summary. The Assistant page (`/assistant`) is the read-only agent chat — see `components/AssistantChat.tsx`.

  All three portals share `components/AssistantChat.tsx` (`portal` prop), each at `/dashboard/<portal>/assistant`, talking to `POST /api/assistant`. Answers carry inline `[#N]` markers rendered as superscript citation chips: hovering one previews the source record/passage, clicking opens it (with a deep link into ClaimRidge where one exists).

  Similarly, all three portals share `components/AuditTrail.tsx` (`portal` prop) at `/dashboard/<portal>/audit` — the Audit Trail & Compliance page (Event Log / AI Inferences / PII Access / Retention & Erasure tabs, a chain-integrity badge, one-click CSV export). All three portals reach it via the *Compliance → Compliance & Audit* sidebar item. PII-access logging is client-reported via `lib/audit.ts:logPiiAccess` because record reads bypass the backend — call it from any page that opens patient-identifying data.
- `app/dashboard/provider/` — provider-admin portal. *Workflow* = New Pre-Auth, Pre-Auth History, New Claim, Claim History, Pipelines; *Network* = Organization. The `/staff` page combines org-code panel, pending join-request approval queue (click-to-expand rows show the doctor's full profile + their join-request message), and the approved roster.
- `app/dashboard/doctor/` — individual-doctor portal. *Workflow* = New Pre-Auth, Pre-Auth History, New Claim, Claim History; *Network* = My Hospitals. The pre-auth pages (`pre-auth/new`, `pre-auth`) use the shared structured `components/PreAuthForm.tsx`; the form's hospital selector sends `clinic_id` so a doctor's submission is attributed to their org (doctors have no `profiles.provider_org_id`, so without it the submission is solo/ungoverned). Dashboard has an affiliation banner (active hospitals + pending join requests with status colours), claims + pre-auth KPI tiles, recent submissions tables, and a 7-day twin-bar activity chart. `/organization` lets a doctor send a new join request by org code (with optional admin note) and shows their pending + previously-rejected history.
- `app/drop-off/` — public anonymous provider submission flow (talks to `/api/dropoff/`).
- `app/auth/callback/`, `app/login/`, `app/signup/`, `app/onboarding/` — Supabase auth flow. Signup accepts `?role=doctor&org=ORG-XXXXXX` to pre-fill the onboarding form; doctor onboarding submits a `join-by-code` request that the hospital admin must approve before `doctor_org_links` is populated (no auto-link).

Supabase clients live in `src/lib/supabase/` — split into `client.ts` (browser), `server.ts` (RSC/route handlers), and `middleware.ts` (used by `src/middleware.ts` for session refresh on every non-asset route). Don't import the browser client from server components or vice versa. Note: the browser client cannot read `policy_chunks` (no RLS read policy for it) — go through the backend's `GET /api/assistant/status` endpoint instead.

`src/data/` holds reference datasets bundled with the app: `cpt.ts`, `icd10.ts`, `payers.ts`. Treat these as static seed/lookup data.

`src/components/insurer/` holds the insurer-portal-specific UI primitives (e.g. `RiskScoreBadge`, `FlagCard`, `AiAnalysisPanel`, `KpiTile`, `ClaimDecisionActions`). `components/ui/` is the generic primitive layer (`Button`, `Input`). `components/ClaimForm.tsx` is the shared claim-submission form used by both provider and doctor portals; it includes a Pre-Authorization section with live debounced lookup against `/api/claims/pre-auth-lookup/{auth_number}`. `components/PreAuthForm.tsx` is the shared two-step pre-auth flow (`mode="doctor" | "provider"`) used by both portals' `pre-auth/new` pages: step 1 drops off the clinical documents and calls `/api/dropoff/extract` to auto-fill the form (per-field AI confidence badges, like the claim form); step 2 is the structured review form that posts to `/api/dropoff/provider`. The same documents are sent with the submission — there is no separate document-upload section in the form. In doctor mode it renders a hospital selector fed by `/api/doctors/affiliations`.

PDF generation runs client-side through `pdf-lib` + `jspdf` (`src/lib/pdf/`). The presence of `puppeteer-core` + `@sparticuz/chromium-min` indicates serverless Chromium-based rendering for richer exports.

### `frontend/CLAUDE.md`

A nested CLAUDE.md exists in `frontend/` with design system notes (Deep Navy `#0A1628` / Teal `#00B4A6` / Inter font) and code-style rules (always TypeScript, `async/await` only, mobile-responsive). It claims the AI layer uses the Anthropic Claude API — that's outdated; the backend actually uses Groq + Gemini + OpenRouter via LangChain. Trust this root file over the frontend one for stack details, but follow the frontend file for design tokens.

## Conventions

- **In-network vs out-of-network:** when a provider submits a pre-auth or claim to a payer that doesn't exist in `insurers`, the row is stored with `payer_id IS NULL` and `routing_status = 'unrouted'`. AI processing is skipped for unrouted rows; they exist only as a record for manual follow-up. Filtering by `payer_id = <insurer_id>` is enough to exclude them — the explicit `routing_status` filter is redundant.
- **Routes that 400 on missing columns:** prefer `select("*")` over explicit column lists when reading from `claims` or `pre_auth_requests` — the schema has grown via migrations and explicit selects break on partially-applied migrations.
- **Doctor onboarding:** code-based only for the prototype. Doctor enters org code → `doctor_join_requests` row created → hospital admin approves on `/staff` → `doctor_org_links` row inserted. Email invitations were prototyped and removed (migration 007); to re-add, use Resend/SES or Supabase's `auth.admin.inviteUserByEmail` and don't reuse the dropped `doctor_invitations` table without redesigning the flow.
- **Embeddings model:** stick with `gemini-embedding-001` at `outputDimensionality: 768` via `services/embeddings.GeminiHTTPEmbeddings`. Don't switch back to `GoogleGenerativeAIEmbeddings` — it 404s on this project's available models.
