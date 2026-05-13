-- ============================================================================
-- 002_clean_reset.sql
--
-- WARNING: DESTRUCTIVE. This drops ALL ClaimRidge tables and recreates them
-- from scratch with the clean schema. It is the right script to run when
-- you are restructuring the platform and the existing rows are test data.
--
-- It does NOT touch auth.users. To wipe users, do that separately in the
-- Supabase Auth dashboard or via the admin API.
-- ============================================================================

-- 1. Drop everything in reverse-FK order.
DROP TABLE IF EXISTS public.ai_inference_log     CASCADE;
DROP TABLE IF EXISTS public.audit_log            CASCADE;
DROP TABLE IF EXISTS public.claims_audit         CASCADE;
DROP TABLE IF EXISTS public.claim_lines          CASCADE;
DROP TABLE IF EXISTS public.claims               CASCADE;
DROP TABLE IF EXISTS public.pre_auth_documents   CASCADE;
DROP TABLE IF EXISTS public.pre_auth_requests    CASCADE;
DROP TABLE IF EXISTS public.policy_chunks        CASCADE;
DROP TABLE IF EXISTS public.doctor_org_links     CASCADE;
DROP TABLE IF EXISTS public.doctor_orgs          CASCADE;  -- old name
DROP TABLE IF EXISTS public.profiles             CASCADE;
DROP TABLE IF EXISTS public.provider_orgs        CASCADE;
DROP TABLE IF EXISTS public.insurers             CASCADE;

DROP FUNCTION IF EXISTS public.match_policy_rules(vector, float, int, uuid);

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. ORG ROOTS
-- ============================================================================

CREATE TABLE public.insurers (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  name_ar                     text,
  country                     text DEFAULT 'Jordan',
  cbj_operations_license      text UNIQUE,
  commercial_license_number   text UNIQUE,
  config                      jsonb DEFAULT '{}'::jsonb,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE TABLE public.provider_orgs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  name_ar         text,
  org_code        text NOT NULL UNIQUE,
  license_number  text UNIQUE,
  country         text DEFAULT 'Jordan',
  address         text,
  contact_email   text,
  config          jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. USERS
-- ============================================================================

CREATE TABLE public.profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type    text NOT NULL CHECK (account_type IN ('provider','doctor','insurance')),
  full_name       text,
  contact_email   text,
  insurer_id      uuid REFERENCES public.insurers(id)      ON DELETE SET NULL,
  role            text,
  provider_org_id uuid REFERENCES public.provider_orgs(id) ON DELETE SET NULL,
  doctor_specialty       text,
  doctor_license_number  text,
  config          jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX profiles_account_type_idx    ON public.profiles(account_type);
CREATE INDEX profiles_insurer_id_idx      ON public.profiles(insurer_id)      WHERE insurer_id     IS NOT NULL;
CREATE INDEX profiles_provider_org_id_idx ON public.profiles(provider_org_id) WHERE provider_org_id IS NOT NULL;

CREATE TABLE public.doctor_org_links (
  doctor_id        uuid NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  provider_org_id  uuid NOT NULL REFERENCES public.provider_orgs(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  PRIMARY KEY (doctor_id, provider_org_id)
);

-- ============================================================================
-- 4. POLICY EMBEDDINGS
-- ============================================================================

CREATE TABLE public.policy_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id  uuid NOT NULL REFERENCES public.insurers(id) ON DELETE CASCADE,
  content     text NOT NULL,
  embedding   vector(768),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX policy_chunks_insurer_id_idx ON public.policy_chunks(insurer_id);

-- ============================================================================
-- 5. INSURER-SIDE: PRE-AUTH
-- ============================================================================

CREATE TABLE public.pre_auth_requests (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurer_id                      uuid NOT NULL REFERENCES public.insurers(id) ON DELETE CASCADE,
  reference_number                text NOT NULL UNIQUE,
  provider_name                   text NOT NULL,
  patient_name                    text NOT NULL,
  patient_id                      text NOT NULL,
  patient_age                     integer,
  patient_gender                  text,
  patient_state                   text,
  diagnosis_code                  text,
  procedure_code                  text,
  provider_specialty              text,
  visit_type                      text,
  length_of_stay                  integer,
  insurance_type                  text,
  claim_amount                    numeric DEFAULT 0,
  currency                        text DEFAULT 'JOD',
  status                          text NOT NULL DEFAULT 'processing',
  sla_deadline                    timestamptz NOT NULL,
  assigned_to                     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ai_decision                     text,
  ai_rationale                    text,
  days_between_service_and_claim  integer,
  submission_month                integer,
  submission_day_of_week          integer,
  created_at                      timestamptz DEFAULT now(),
  updated_at                      timestamptz DEFAULT now()
);

CREATE INDEX pre_auth_insurer_id_idx ON public.pre_auth_requests(insurer_id);
CREATE INDEX pre_auth_status_idx     ON public.pre_auth_requests(status);
CREATE INDEX pre_auth_sla_idx        ON public.pre_auth_requests(sla_deadline);

CREATE TABLE public.pre_auth_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_auth_id     uuid NOT NULL REFERENCES public.pre_auth_requests(id) ON DELETE CASCADE,
  file_name       text NOT NULL,
  file_type       text NOT NULL,
  file_base64     text,
  extracted_text  text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX pre_auth_documents_pre_auth_id_idx ON public.pre_auth_documents(pre_auth_id);

-- ============================================================================
-- 6. PROVIDER-SIDE: CLAIMS
-- ============================================================================

CREATE TABLE public.claims (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number         text UNIQUE,
  user_id              uuid REFERENCES public.profiles(id)      ON DELETE SET NULL,
  clinic_id            uuid REFERENCES public.provider_orgs(id) ON DELETE SET NULL,
  payer_id             uuid REFERENCES public.insurers(id)      ON DELETE SET NULL,
  member_id            text,
  patient_name         text,
  patient_id           text,
  provider_name        text,
  payer_name           text,
  date_of_service      date NOT NULL,
  diagnosis_codes      text[],
  procedure_codes      text[],
  total_billed         numeric NOT NULL DEFAULT 0,
  total_allowed        numeric DEFAULT 0,
  currency             text DEFAULT 'JOD',
  status               text NOT NULL DEFAULT 'intake_complete',
  notes                text,
  scrub_result         jsonb DEFAULT '{}'::jsonb,
  scrub_passed         boolean DEFAULT false,
  scrub_warnings       integer DEFAULT 0,
  ai_risk_score        integer CHECK (ai_risk_score IS NULL OR ai_risk_score BETWEEN 0 AND 100),
  ai_complexity_score  integer CHECK (ai_complexity_score IS NULL OR ai_complexity_score BETWEEN 1 AND 5),
  ai_recommendation    text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE INDEX claims_user_id_idx   ON public.claims(user_id);
CREATE INDEX claims_clinic_id_idx ON public.claims(clinic_id);
CREATE INDEX claims_payer_id_idx  ON public.claims(payer_id);
CREATE INDEX claims_status_idx    ON public.claims(status);

CREATE TABLE public.claim_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  cpt_code        text NOT NULL,
  icd10_code      text NOT NULL,
  units           integer DEFAULT 1,
  billed_amount   numeric NOT NULL DEFAULT 0,
  allowed_amount  numeric DEFAULT 0,
  denial_reason   text,
  metadata        jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX claim_lines_claim_id_idx ON public.claim_lines(claim_id);

CREATE TABLE public.claims_audit (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id                uuid REFERENCES public.claims(id)   ON DELETE CASCADE,
  user_id                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
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

CREATE INDEX claims_audit_claim_id_idx  ON public.claims_audit(claim_id);
CREATE INDEX claims_audit_user_id_idx   ON public.claims_audit(user_id);
CREATE INDEX claims_audit_reference_idx ON public.claims_audit(claim_reference_number);

-- ============================================================================
-- 7. SHARED LOGS
-- ============================================================================

CREATE TABLE public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action        text NOT NULL,
  target_id     uuid NOT NULL,
  target_type   text NOT NULL,
  payload_hash  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_inference_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id              uuid REFERENCES public.claims(id)             ON DELETE CASCADE,
  pre_auth_id           uuid REFERENCES public.pre_auth_requests(id)  ON DELETE CASCADE,
  model_version         text NOT NULL,
  prompt_template_name  text,
  input_data            jsonb NOT NULL,
  output_data           jsonb NOT NULL,
  confidence_score      numeric,
  latency_ms            integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_inference_log_one_target_chk
    CHECK ((claim_id IS NOT NULL) <> (pre_auth_id IS NOT NULL))
);

-- ============================================================================
-- 8. RPC: vector similarity search for policy rules
-- ============================================================================

CREATE OR REPLACE FUNCTION public.match_policy_rules(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_insurer_id uuid
)
RETURNS TABLE (id uuid, content text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id,
    pc.content,
    1 - (pc.embedding <=> query_embedding) AS similarity
  FROM public.policy_chunks pc
  WHERE pc.insurer_id = p_insurer_id
    AND 1 - (pc.embedding <=> query_embedding) > match_threshold
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_orgs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_org_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY provider_orgs_select_all ON public.provider_orgs
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY provider_orgs_insert_authenticated ON public.provider_orgs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY provider_orgs_update_own ON public.provider_orgs
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.provider_org_id = provider_orgs.id
              AND p.account_type = 'provider')
  );

CREATE POLICY insurers_select_all ON public.insurers
  FOR SELECT USING (true);
CREATE POLICY insurers_insert_authenticated ON public.insurers
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY doctor_org_links_select_own ON public.doctor_org_links
  FOR SELECT USING (auth.uid() = doctor_id
                 OR EXISTS (SELECT 1 FROM public.profiles p
                            WHERE p.id = auth.uid()
                              AND p.provider_org_id = doctor_org_links.provider_org_id));
CREATE POLICY doctor_org_links_insert_own ON public.doctor_org_links
  FOR INSERT WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY doctor_org_links_delete_own ON public.doctor_org_links
  FOR DELETE USING (auth.uid() = doctor_id
                 OR EXISTS (SELECT 1 FROM public.profiles p
                            WHERE p.id = auth.uid()
                              AND p.provider_org_id = doctor_org_links.provider_org_id));

-- ============================================================================
-- Done. Old migration file `001_add_provider_side.sql` is now obsolete.
-- ============================================================================
