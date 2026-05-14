# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ClaimRidge is an AI insurance compliance layer for the MENA market (Jordan-first, then UAE/KSA). It connects three user types — providers (hospitals/clinics), doctors, and insurers — across two distinct workflows:

- **Pre-authorisation** (prospective): provider asks the insurer to greenlight a planned procedure. AI runs medical-necessity review against the insurer's policy. On approval, the system issues an `authorization_number` valid for a configurable window.
- **Claims** (retrospective): provider files a bill *after* service. AI runs coding/billing scrubbing + statistical fraud detection. Claims that reference a pre-auth get verified against the auth's window, patient identity, and approved procedure scope.

Fraud detection (XGBoost + structured bilingual case files) runs on **claims only** — the pre-auth pipeline calls a no-op stub today and will gain its own dedicated fraud model later.

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

The older `001_add_provider_side.sql` and `003_cleanup_orphans.sql` exist for historical migrations from the legacy single-app model and don't need to run on a fresh install.

## Architecture

### Cross-cutting

- **Supabase is the single source of truth.** Both apps talk to the same Postgres directly — there is no internal API layer between the frontend and DB for read paths. The FastAPI backend is invoked for AI-heavy write paths (document OCR, pre-auth evaluation, claim scrubbing + fraud, policy embedding, policy chat). The schema lives in `backend/database.sql` (context-only).
- **Auth is Supabase JWT.** `core/security.py:get_current_user` verifies bearer tokens via `supabase.auth.get_user(token)`. Routers resolve the caller's profile and scope queries by either `insurer_id` (insurer staff), `provider_org_id` (provider admins), or `user_id` / `doctor_org_links` (doctors).
- **Multi-tenancy:** every authenticated endpoint must look up the caller's profile and constrain Supabase queries by the appropriate tenant id. Bugs that leak data across tenants look like missing `.eq("insurer_id", …)` / `.eq("payer_id", …)` filters.
- **Authorization linkage (the cross-cutting workflow):** approving a pre-auth (manually or via AI auto-approve) issues an `AUTH-YYYYMMDD-XXXXXXXX` number with a 90-day default validity (overridable per insurer via `insurers.config.pre_auth_validity_days`). When a claim is submitted with that number, `services/authorization.py:verify_authorization` checks (a) auth exists for this insurer, (b) within validity window, (c) patient identity matches, (d) at least one billed procedure code overlaps `approved_procedures`. The verdict persists on `claims.auth_check_status` (`ok` | `missing` | `expired` | `wrong_patient` | `code_mismatch` | `not_applicable`) and is fed into the claim scrubber prompt so the LLM raises an `error`-severity issue on broken linkage.
- **Two LLM prompts, two purposes:** `PRE_AUTH_SYSTEM_PROMPT` evaluates medical necessity (identity + clinical alignment + MCG/InterQual-style severity/conservative-care/setting criteria) — it does NOT do coding review. `SCRUB_SYSTEM_PROMPT` does coding/billing review (CPT↔ICD alignment, NCCI bundling, upcoding, modifiers, fee schedule) and is auth-aware via the `auth_check_summary` block. Don't merge these prompts back together — they represent different workflows.

### Backend (`backend/`)

FastAPI app composed of routers + services. `main.py` registers the routers below. CORS is open `*`.

Routers:

- `routers/pre_auth.py` — insurer-side queue + manual decision (`GET /api/pre-auth/queue`, `POST /api/pre-auth/{id}/review`). Manual approval issues an authorization via `services/authorization.issue_authorization`; deny/escalate revokes any previously-issued auth.
- `routers/dropoff.py` — provider-facing pre-auth submission. Anonymous public form at `POST /api/dropoff/`; authenticated provider variant at `POST /api/dropoff/provider` (handles out-of-network "unrouted" mode where `payer_id IS NULL` and AI processing is skipped); list at `GET /api/dropoff/my-submissions`.
- `routers/claims.py` — provider-facing claim submission (`POST /api/claims/scrub`). On submit: resolves payer, runs `verify_authorization`, persists claim, fires `_run_fraud_layer` in the background (XGBoost → if high/extreme, auto-generates and persists a `FraudCaseFile`), then runs the auth-aware AI scrubber. Pre-auth preview lookup at `GET /api/claims/pre-auth-lookup/{auth_number}` powers the claim form's live preview.
- `routers/insurer.py` — policy upload + embedding (`POST /api/insurer/process-policy`), policy delete (`DELETE /api/insurer/policy`), legacy claim review/analyze.
- `routers/fraud.py` — generates structured `FraudCaseFile` for flagged **claims** (`POST /api/fraud/generate-case`, takes `claim_id`). Persists via `services/case_engine.persist_fraud_case`.
- `routers/providers.py` — provider admin endpoints: own org info (`/me`), doctor roster (`/doctors`), join-request approval queue (`/join-requests`, `/join-requests/{id}/decision`).
- `routers/doctors.py` — doctor join-by-code flow (`POST /api/doctors/join-by-code` creates a pending request, requires admin approval) and affiliation list (`GET /api/doctors/affiliations`).
- `routers/policy_chat.py` — insurer-side RAG chatbot over the uploaded policy. Status endpoint at `GET /api/policy-chat/status` (used by the frontend to detect uploaded policies — the browser client can't read `policy_chunks` directly). Chat at `POST /api/policy-chat` exposes a single tool `search_policy_handbook(query, top_k)` to the LLM and lets it triangulate (up to 4 tool hops per turn). Returns `{ answer, sources, tool_calls }` with `[#N]` citation markers.
- `routers/intake.py`, `routers/user.py` — claim intake helpers and account-lifecycle (delete cascade).

Services (keep routers thin):

- `services/ai_services.py` — both pipelines. `evaluate_pre_auth` runs the medical-necessity LLM (the pre-auth fraud stub always returns low risk today, so every routed request gets clinical+policy review). `scrub_claim` runs the coding-focused LLM with the auth-check summary baked into the prompt. Auto-approve in `_persist_decision` calls `issue_authorization`. Embeddings come from `services/embeddings.py`, NOT `langchain_google_genai.GoogleGenerativeAIEmbeddings` (see below).
- `services/embeddings.py` — direct-HTTP wrapper around Gemini's v1beta `embedContent` endpoint. Required because (a) the langchain wrapper hits a `batchEmbedContents` endpoint that the project's available models don't expose, and (b) `gemini-embedding-001` defaults to 3072-dim output but `policy_chunks.embedding` is `vector(768)`. The wrapper passes `outputDimensionality: 768` (Matryoshka truncation). Implements `embed_documents` / `embed_query` so it slots into existing langchain-style call sites.
- `services/fraud_service.py` — Layer-1 XGBoost claim-fraud detector. Loads `models/production_fraud_model.xgb` + `models/production_label_encoders.pkl` + `models/feature_names.pkl` at import time. Threshold `70.0`, extreme threshold `90.0`. Model paths resolve relative to `backend/` — always run with `backend/` as CWD or model loading silently fails (logs a warning, `model` becomes `None`).
- `services/pre_auth_fraud_service.py` — **no-op stub** for the future pre-auth fraud model. Always returns `low` risk. Swap the implementation when a real pre-auth model is trained — the call site in `ai_services.py:check_fraud_system` won't need to change.
- `services/case_engine.py` — generates the bilingual (EN+AR) `FraudCaseFile` (flag_type, severity, confidence, summaries, evidence, prioritised actions). `persist_fraud_case` writes to `fraud_cases` and back-links via `claims.fraud_case_id`. The engine reads from `claims`, NOT `pre_auth_requests`.
- `services/authorization.py` — issues authorization numbers (`issue_authorization`), revokes them on overturned approvals (`revoke_authorization`), and verifies claim ↔ auth linkage (`verify_authorization`). Idempotent — re-issuing on an already-authorised row returns the existing number.
- `services/code_lookup.py` — CPT/ICD-10 description lookup used by the pre-auth prompt.

LLM calls go through LangChain (`langchain_groq`, `langchain_google_genai`, `langchain-openai`). Vectors live in `policy_chunks.embedding` (pgvector, 768-dim). The `match_policy_rules` RPC powers RAG retrieval in both the pre-auth pipeline, the claim scrubber, and the policy chatbot.

### Frontend (`frontend/`)

Next.js 14 App Router, TypeScript, Tailwind. Three authenticated portals, each with its own layout + sidebar, plus a public drop-off and the auth routes:

- `app/dashboard/insurance/` — insurer portal. Nav groups: *Overview* (Dashboard), *Medical Operations* (Pre-Auth Queue, Claims Inbox, Fraud Detection), *Knowledge Base* (Medical Policies/RAG chat, Network Providers), *Intelligence* (Analytics, Audit). Dashboard renders two parallel sections — pre-auth KPIs + decision-mix bar + priority inbox, and claims KPIs + 7-day twin-sparkline + recent claims — all from real Supabase queries. The fraud page surfaces flagged claims and lets the reviewer generate a `FraudCaseFile` modal with bilingual summary. The policies page is a tool-using chat with clickable `[#N]` citations that open source-passage modals.
- `app/dashboard/provider/` — provider-admin portal. Nav: Dashboard, Pipelines, Claim History, New Claim, Pre-Auth Drop-Off (links to public form), Staff/Organization. The `/staff` page combines org-code panel, pending join-request approval queue (click-to-expand rows show the doctor's full profile + their join-request message), and the approved roster.
- `app/dashboard/doctor/` — individual-doctor portal. Nav: Dashboard, New Claim, New Pre-Auth, Claim History, My Hospitals. Dashboard has an affiliation banner (active hospitals + pending join requests with status colours), claims + pre-auth KPI tiles, recent submissions tables, and a 7-day twin-bar activity chart. `/organization` lets a doctor send a new join request by org code (with optional admin note) and shows their pending + previously-rejected history.
- `app/drop-off/` — public anonymous provider submission flow (talks to `/api/dropoff/`).
- `app/auth/callback/`, `app/login/`, `app/signup/`, `app/onboarding/` — Supabase auth flow. Signup accepts `?role=doctor&org=ORG-XXXXXX` to pre-fill the onboarding form; doctor onboarding submits a `join-by-code` request that the hospital admin must approve before `doctor_org_links` is populated (no auto-link).

Supabase clients live in `src/lib/supabase/` — split into `client.ts` (browser), `server.ts` (RSC/route handlers), and `middleware.ts` (used by `src/middleware.ts` for session refresh on every non-asset route). Don't import the browser client from server components or vice versa. Note: the browser client cannot read `policy_chunks` (no RLS read policy for it) — go through the backend's policy-chat status endpoint instead.

`src/data/` holds reference datasets bundled with the app: `cpt.ts`, `icd10.ts`, `payers.ts`. Treat these as static seed/lookup data.

`src/components/insurer/` holds the insurer-portal-specific UI primitives (e.g. `RiskScoreBadge`, `FlagCard`, `AiAnalysisPanel`, `KpiTile`, `ClaimDecisionActions`). `components/ui/` is the generic primitive layer (`Button`, `Input`). `components/ClaimForm.tsx` is the shared claim-submission form used by both provider and doctor portals; it includes a Pre-Authorization section with live debounced lookup against `/api/claims/pre-auth-lookup/{auth_number}`.

PDF generation runs client-side through `pdf-lib` + `jspdf` (`src/lib/pdf/`). The presence of `puppeteer-core` + `@sparticuz/chromium-min` indicates serverless Chromium-based rendering for richer exports.

### `frontend/CLAUDE.md`

A nested CLAUDE.md exists in `frontend/` with design system notes (Deep Navy `#0A1628` / Teal `#00B4A6` / Inter font) and code-style rules (always TypeScript, `async/await` only, mobile-responsive). It claims the AI layer uses the Anthropic Claude API — that's outdated; the backend actually uses Groq + Gemini + OpenRouter via LangChain. Trust this root file over the frontend one for stack details, but follow the frontend file for design tokens.

## Conventions

- **In-network vs out-of-network:** when a provider submits a pre-auth or claim to a payer that doesn't exist in `insurers`, the row is stored with `payer_id IS NULL` and `routing_status = 'unrouted'`. AI processing is skipped for unrouted rows; they exist only as a record for manual follow-up. Filtering by `payer_id = <insurer_id>` is enough to exclude them — the explicit `routing_status` filter is redundant.
- **Routes that 400 on missing columns:** prefer `select("*")` over explicit column lists when reading from `claims` or `pre_auth_requests` — the schema has grown via migrations and explicit selects break on partially-applied migrations.
- **Doctor onboarding:** code-based only for the prototype. Doctor enters org code → `doctor_join_requests` row created → hospital admin approves on `/staff` → `doctor_org_links` row inserted. Email invitations were prototyped and removed (migration 007); to re-add, use Resend/SES or Supabase's `auth.admin.inviteUserByEmail` and don't reuse the dropped `doctor_invitations` table without redesigning the flow.
- **Embeddings model:** stick with `gemini-embedding-001` at `outputDimensionality: 768` via `services/embeddings.GeminiHTTPEmbeddings`. Don't switch back to `GoogleGenerativeAIEmbeddings` — it 404s on this project's available models.
