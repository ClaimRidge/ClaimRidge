-- ============================================================================
-- ClaimRidge — Provider-side migration
-- Run this AFTER the existing insurer-side schema is in place.
-- Idempotent: safe to run multiple times.
-- ============================================================================

-- pgvector must already be enabled for policy_chunks. No-op if it is.
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1. Extend `profiles` with provider-side columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type      text,         -- 'provider' | 'insurance' | 'doctor'
  ADD COLUMN IF NOT EXISTS organization_name text,
  ADD COLUMN IF NOT EXISTS license_number    text,
  ADD COLUMN IF NOT EXISTS payer_code        text,
  ADD COLUMN IF NOT EXISTS country_code      text DEFAULT 'JOR',
  ADD COLUMN IF NOT EXISTS policy_file_path  text,
  ADD COLUMN IF NOT EXISTS policy_file_name  text,
  ADD COLUMN IF NOT EXISTS org_code          text,
  ADD COLUMN IF NOT EXISTS parent_org_id     uuid,
  ADD COLUMN IF NOT EXISTS config_json       jsonb DEFAULT '{}'::jsonb;

-- Uniqueness for the lookup keys
CREATE UNIQUE INDEX IF NOT EXISTS profiles_license_number_key ON public.profiles(license_number) WHERE license_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_payer_code_key     ON public.profiles(payer_code)     WHERE payer_code     IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_org_code_key       ON public.profiles(org_code)       WHERE org_code       IS NOT NULL;

-- parent_org_id -> auth.users (the parent provider account)
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_parent_org_id_fkey
    FOREIGN KEY (parent_org_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. doctor_orgs: many-to-many doctor <-> hospital
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_orgs (
  doctor_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (doctor_id, org_id)
);

-- ---------------------------------------------------------------------------
-- 3. claims (provider-side)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.claims (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            uuid,
  payer_id               uuid,
  user_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  clinic_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claim_number           text UNIQUE,
  member_id              text,
  patient_name           text,
  patient_id             text,
  provider_name          text,
  payer_name             text,
  payer_name_raw         text,
  date_of_service        date NOT NULL,
  status                 text NOT NULL DEFAULT 'intake_complete',
  total_billed           numeric NOT NULL DEFAULT 0,
  billed_amount          numeric DEFAULT 0,
  total_allowed          numeric DEFAULT 0,
  currency               text DEFAULT 'JOD',
  diagnosis_codes        text[],
  procedure_codes        text[],
  notes                  text,
  scrub_result           jsonb DEFAULT '{}'::jsonb,
  scrub_passed           boolean DEFAULT false,
  scrub_warnings         integer DEFAULT 0,
  needs_entity_mapping   boolean DEFAULT false,
  ai_risk_score          integer CHECK (ai_risk_score IS NULL OR (ai_risk_score BETWEEN 0 AND 100)),
  ai_complexity_score    integer CHECK (ai_complexity_score IS NULL OR (ai_complexity_score BETWEEN 1 AND 5)),
  ai_recommendation      text,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_payer_id_idx   ON public.claims(payer_id);
CREATE INDEX IF NOT EXISTS claims_user_id_idx    ON public.claims(user_id);
CREATE INDEX IF NOT EXISTS claims_clinic_id_idx  ON public.claims(clinic_id);
CREATE INDEX IF NOT EXISTS claims_status_idx     ON public.claims(status);

-- ---------------------------------------------------------------------------
-- 4. claim_lines (line items per claim)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.claim_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  cpt_code       text NOT NULL,
  icd10_code     text NOT NULL,
  units          integer DEFAULT 1,
  billed_amount  numeric NOT NULL DEFAULT 0,
  allowed_amount numeric DEFAULT 0,
  denial_reason  text,
  metadata       jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS claim_lines_claim_id_idx ON public.claim_lines(claim_id);

-- ---------------------------------------------------------------------------
-- 5. claims_audit (immutable audit log per claim)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.claims_audit (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claim_reference_number  text,
  patient_name            text,
  date_of_service         date,
  provider_name           text,
  payer_name              text,
  diagnosis_codes         text[],
  procedure_codes         text[],
  billed_amount           numeric,
  ai_flags                jsonb DEFAULT '[]'::jsonb,
  ai_corrections          jsonb DEFAULT '{}'::jsonb,
  export_count            integer DEFAULT 0,
  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_audit_user_id_idx   ON public.claims_audit(user_id);
CREATE INDEX IF NOT EXISTS claims_audit_reference_idx ON public.claims_audit(claim_reference_number);

-- ---------------------------------------------------------------------------
-- 6. ai_inference_log: add a `claim_id` column for provider-side logging
--    (the existing column `pre_auth_id` stays in place for insurer-side)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_inference_log
  ADD COLUMN IF NOT EXISTS claim_id          uuid,
  ADD COLUMN IF NOT EXISTS confidence_score  numeric;

DO $$ BEGIN
  ALTER TABLE public.ai_inference_log
    ADD CONSTRAINT ai_inference_log_claim_id_fkey
    FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 7. RLS policies for profiles (so signup/onboarding upsert actually works)
--     If your project already has these, the DO blocks are no-ops.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Doctors need to read other providers' profiles to look up org_code on signup.
-- (org_code is a public-by-design lookup, not a secret.)
DO $$ BEGIN
  CREATE POLICY profiles_select_by_org_code ON public.profiles
    FOR SELECT USING (org_code IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- DONE
-- Tables created/updated:
--   profiles (extended columns)
--   doctor_orgs                (NEW)
--   claims                     (NEW)
--   claim_lines                (NEW)
--   claims_audit               (NEW)
--   ai_inference_log.claim_id  (NEW column)
-- ============================================================================
