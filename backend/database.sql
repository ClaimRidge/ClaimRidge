-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_inference_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  claim_id uuid,
  model_version text NOT NULL,
  prompt_template_name text,
  input_data jsonb NOT NULL,
  output_data jsonb NOT NULL,
  confidence_score numeric,
  latency_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_inference_log_pkey PRIMARY KEY (id),
  CONSTRAINT ai_inference_log_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_id uuid NOT NULL,
  target_type text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.claim_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL,
  cpt_code text NOT NULL,
  icd10_code text NOT NULL,
  units integer DEFAULT 1,
  billed_amount numeric NOT NULL DEFAULT 0,
  allowed_amount numeric DEFAULT 0,
  denial_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT claim_lines_pkey PRIMARY KEY (id),
  CONSTRAINT claim_lines_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.claims(id)
);
CREATE TABLE public.claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL,
  payer_id uuid NOT NULL,
  member_id text NOT NULL,
  service_date date NOT NULL,
  status text NOT NULL DEFAULT 'intake_complete'::text,
  total_billed numeric NOT NULL DEFAULT 0,
  total_allowed numeric DEFAULT 0,
  currency text DEFAULT 'JOD'::text,
  ai_risk_score integer CHECK (ai_risk_score >= 0 AND ai_risk_score <= 100),
  ai_complexity_score integer CHECK (ai_complexity_score >= 1 AND ai_complexity_score <= 5),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  clinic_id uuid,
  claim_number text UNIQUE,
  patient_name text,
  patient_id text,
  provider_name text,
  payer_name text,
  diagnosis_codes ARRAY,
  procedure_codes ARRAY,
  billed_amount numeric DEFAULT 0,
  notes text,
  scrub_result jsonb DEFAULT '{}'::jsonb,
  scrub_passed boolean DEFAULT false,
  scrub_warnings integer DEFAULT 0,
  CONSTRAINT claims_pkey PRIMARY KEY (id),
  CONSTRAINT claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT claims_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES auth.users(id)
);
CREATE TABLE public.claims_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  claim_reference_number text,
  patient_name text,
  date_of_service date,
  provider_name text,
  payer_name text,
  diagnosis_codes ARRAY,
  procedure_codes ARRAY,
  billed_amount numeric,
  ai_flags jsonb DEFAULT '[]'::jsonb,
  ai_corrections jsonb DEFAULT '{}'::jsonb,
  export_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT claims_audit_pkey PRIMARY KEY (id),
  CONSTRAINT claims_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.directory_entities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['clinic'::text, 'insurer'::text])),
  name_en text NOT NULL,
  name_ar text,
  country text DEFAULT 'Jordan'::text,
  city text,
  license_number text UNIQUE,
  is_verified boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT directory_entities_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  account_type USER-DEFINED NOT NULL,
  organization_name text NOT NULL,
  license_number text UNIQUE,
  payer_code text UNIQUE,
  contact_email text,
  country_code text DEFAULT 'JOR'::text,
  config_json jsonb DEFAULT '{}'::jsonb,
  policy_file_path text,
  policy_file_name text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);