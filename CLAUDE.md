# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ClaimRidge is an AI insurance compliance layer for the MENA market (Jordan-first, then UAE/KSA). It validates medical pre-authorisation requests against payer-specific policies before submission, using a two-layer fraud check (XGBoost statistical pre-screen + LLM clinical triage) to reduce denials for providers and manual review cost for insurers.

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

Frontend uses standard Next.js public env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for the browser/SSR Supabase clients in `src/lib/supabase/`.

## Architecture

### Cross-cutting

- **Supabase is the single source of truth.** Both apps talk to the same Postgres directly — there is no internal API layer between the frontend and DB for read paths. The FastAPI backend is invoked for AI-heavy write paths (document OCR, pre-auth evaluation, fraud case generation, policy embedding). The schema lives in `backend/database.sql` (context-only; it documents tables, not a migration).
- **Auth is Supabase JWT.** The backend's `core/security.py:get_current_user` verifies bearer tokens via `supabase.auth.get_user(token)` and most routes scope queries by `insurer_id` resolved from the `profiles` table. When adding a new authenticated endpoint, follow this pattern: look up the user's profile, pull `insurer_id`, and constrain every Supabase query by it — this is the multi-tenant boundary.
- **Multi-tenancy by `insurer_id`.** Almost every table has an `insurer_id` FK. Bugs that leak data across insurers will look like missing `.eq("insurer_id", insurer_id)` filters on Supabase queries.

### Backend (`backend/`)

FastAPI app composed of routers + services. `main.py` wires CORS (open `*`) and registers five routers.

- `routers/pre_auth.py` — insurer-side queue + decision endpoints (`/api/pre-auth/queue`, `/{id}/review`).
- `routers/dropoff.py` — provider-facing public submission portal (`/api/dropoff/...`); accepts base64-encoded PDFs/DOCX, kicks off async pre-auth processing.
- `routers/insurer.py` — policy upload + embedding for the RAG layer (`/api/insurer/process-policy`).
- `routers/fraud.py` — generates bilingual (EN/AR) fraud case files for flagged claims (`/api/fraud/generate-case`).
- `routers/user.py` — account lifecycle (delete cascade across `profiles`, `claims`, `claims_audit`).

Services contain the actual logic — keep routers thin:

- `services/ai_services.py` — the **pre-auth pipeline**. Extracts text (`pypdfium2` for PDFs, `python-docx` for DOCX, OCR fallback), pulls policy chunks from `policy_chunks` for RAG context, calls `fraud_service` for the statistical layer, then runs the LLM with a structured prompt that performs identity cross-validation, fraud screening, and policy compliance in a fixed step order. Output is persisted to `pre_auth_requests` (`ai_decision`, `ai_rationale`) and `ai_inference_log`.
- `services/fraud_service.py` — **Layer 1 fraud detector.** Loads `models/production_fraud_model.xgb` + `models/production_label_encoders.pkl` at import time via `FraudDetector`. Threshold is `70.0`. Model paths resolve relative to the `backend/` directory, so always run the backend with `backend/` as CWD or model loading will silently fail (it logs a warning and `model` becomes `None`). The older `layer1_anomaly_v1.xgb` / `label_encoders.pkl` files are deprecated — `production_*` are the current artifacts.
- `services/case_engine.py` — generates the structured `FraudCaseFile` (Pydantic schema with EN + AR summaries, evidence, prioritised actions) for flagged pre-auths.

LLM calls go through LangChain (`langchain_groq`, `langchain_google_genai`, `langchain-openai`). Embeddings use `GoogleGenerativeAIEmbeddings`; vectors are stored in `policy_chunks.embedding` (pgvector).

### Frontend (`frontend/`)

Next.js 14 App Router, TypeScript, Tailwind. Two distinct portals share the codebase:

- `app/drop-off/` — public provider submission flow (no auth required for the dropoff itself; talks to `/api/dropoff/*`).
- `app/dashboard/insurance/` — authenticated insurer dashboard. Contains `pre-auth/`, `queue/`, `claims/`, `fraud/`, `policies/`, `analytics/`, `appeals/`, `audit/`, `payments/`, `providers/`, `settings/` subroutes plus a shared `layout.tsx`. The `queue/` directory is a recent addition (currently untracked).
- `app/auth/callback/`, `app/login/`, `app/signup/`, `app/onboarding/` — Supabase auth flow.

Supabase clients live in `src/lib/supabase/` — split into `client.ts` (browser), `server.ts` (RSC/route handlers), and `middleware.ts` (used by `src/middleware.ts` for session refresh on every non-asset route). Don't import the browser client from server components or vice versa.

`src/data/` holds reference datasets bundled with the app: `cpt.ts`, `icd10.ts`, `payers.ts`. Treat these as static seed/lookup data — they're not fetched.

`src/components/insurer/` holds the insurer-portal-specific UI primitives (e.g. `RiskScoreBadge`, `FlagCard`, `AiAnalysisPanel`, `KpiTile`, `ClaimDecisionActions`). `components/ui/` is the generic primitive layer (`Button`, `Input`).

PDF generation runs client-side through `pdf-lib` + `jspdf` (`src/lib/pdf/`). The presence of `puppeteer-core` + `@sparticuz/chromium-min` indicates serverless Chromium-based rendering for richer exports.

### `frontend/CLAUDE.md`

A nested CLAUDE.md exists in `frontend/` with design system notes (Deep Navy `#0A1628` / Teal `#00B4A6` / Inter font) and code-style rules (always TypeScript, `async/await` only, mobile-responsive). It claims the AI layer uses the Anthropic Claude API — that's outdated; the backend actually uses Groq + Gemini + OpenRouter via LangChain. Trust this root file over the frontend one for stack details, but follow the frontend file for design tokens.
