-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_inference_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pre_auth_id uuid,
  model_version text NOT NULL,
  prompt_template_name text,
  input_data jsonb NOT NULL,
  output_data jsonb NOT NULL,
  latency_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_inference_log_pkey PRIMARY KEY (id),
  CONSTRAINT ai_inference_log_pre_auth_id_fkey FOREIGN KEY (pre_auth_id) REFERENCES public.pre_auth_requests(id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_id uuid NOT NULL,
  target_type text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.insurers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code text DEFAULT 'JOR'::text,
  config_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  cbj_operations_license text UNIQUE,
  commercial_license_number text UNIQUE,
  country text DEFAULT 'Jordan'::text,
  CONSTRAINT insurers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.policy_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  insurer_id uuid,
  content text NOT NULL,
  embedding USER-DEFINED,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT policy_chunks_pkey PRIMARY KEY (id),
  CONSTRAINT policy_chunks_insurer_id_fkey FOREIGN KEY (insurer_id) REFERENCES public.insurers(id)
);
CREATE TABLE public.pre_auth_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pre_auth_id uuid,
  file_name text NOT NULL,
  file_type text NOT NULL,
  extracted_text text,
  created_at timestamp with time zone DEFAULT now(),
  file_base64 text,
  CONSTRAINT pre_auth_documents_pkey PRIMARY KEY (id),
  CONSTRAINT pre_auth_documents_pre_auth_id_fkey FOREIGN KEY (pre_auth_id) REFERENCES public.pre_auth_requests(id)
);
CREATE TABLE public.pre_auth_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  insurer_id uuid,
  reference_number text NOT NULL UNIQUE,
  provider_name text NOT NULL,
  patient_name text NOT NULL,
  patient_id text NOT NULL,
  claim_amount numeric DEFAULT 0,
  currency text DEFAULT 'JOD'::text,
  status text NOT NULL DEFAULT 'processing'::text,
  sla_deadline timestamp with time zone NOT NULL,
  assigned_to uuid,
  ai_decision text,
  ai_rationale text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  patient_age integer,
  patient_gender text,
  diagnosis_code text,
  procedure_code text,
  days_between_service_and_claim integer,
  patient_state text,
  length_of_stay integer,
  visit_type text,
  insurance_type text,
  provider_specialty text,
  submission_month integer,
  submission_day_of_week integer,
  CONSTRAINT pre_auth_requests_pkey PRIMARY KEY (id),
  CONSTRAINT pre_auth_requests_insurer_id_fkey FOREIGN KEY (insurer_id) REFERENCES public.insurers(id),
  CONSTRAINT pre_auth_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  insurer_id uuid,
  role text NOT NULL DEFAULT 'medical_officer'::text,
  full_name text,
  contact_email text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_insurer_id_fkey FOREIGN KEY (insurer_id) REFERENCES public.insurers(id)
);