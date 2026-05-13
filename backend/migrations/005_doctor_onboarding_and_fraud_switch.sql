-- ============================================================================
-- Migration 005 — Doctor onboarding tables + move fraud from pre-auth to claims
-- ----------------------------------------------------------------------------
-- Adds:
--   • doctor_join_requests       — pending/approved/rejected joins by org code
--   • doctor_invitations         — email-based invitations with a token
--   • fraud_cases                — persisted FraudCaseFile (was ephemeral)
--   • claims.fraud_score, fraud_flags, fraud_case_id
--   • pre_auth_requests.routing_status  — 'routed' | 'unrouted'
--   • claims.routing_status             — 'routed' | 'unrouted'
--   • ai_inference_log gains a claim_id-only constraint relaxation (already OK)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Doctor join requests (code-based, requires provider admin approval)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_join_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       uuid NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  provider_org_id uuid NOT NULL REFERENCES public.provider_orgs(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  message         text,
  decided_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, provider_org_id, status)
);

CREATE INDEX IF NOT EXISTS doctor_join_requests_org_idx
  ON public.doctor_join_requests(provider_org_id);
CREATE INDEX IF NOT EXISTS doctor_join_requests_doctor_idx
  ON public.doctor_join_requests(doctor_id);

-- ---------------------------------------------------------------------------
-- Email invitations (token-based)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_org_id uuid NOT NULL REFERENCES public.provider_orgs(id) ON DELETE CASCADE,
  invited_email   text NOT NULL,
  token           text NOT NULL UNIQUE,
  status          text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at     timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doctor_invitations_org_idx
  ON public.doctor_invitations(provider_org_id);
CREATE INDEX IF NOT EXISTS doctor_invitations_email_idx
  ON public.doctor_invitations(invited_email);

-- ---------------------------------------------------------------------------
-- Routing status for cross-network submissions
-- ---------------------------------------------------------------------------
ALTER TABLE public.pre_auth_requests
  ADD COLUMN IF NOT EXISTS routing_status text NOT NULL DEFAULT 'routed'
    CHECK (routing_status IN ('routed','unrouted')),
  ADD COLUMN IF NOT EXISTS submitted_by   uuid REFERENCES public.profiles(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitter_org  uuid REFERENCES public.provider_orgs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_name_raw text;

-- insurer_id was NOT NULL — make it nullable for unrouted requests
ALTER TABLE public.pre_auth_requests
  ALTER COLUMN insurer_id DROP NOT NULL;

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS routing_status text NOT NULL DEFAULT 'routed'
    CHECK (routing_status IN ('routed','unrouted')),
  ADD COLUMN IF NOT EXISTS payer_name_raw text;

-- ---------------------------------------------------------------------------
-- Fraud columns on claims (Layer-1 statistical model output lives here now)
-- ---------------------------------------------------------------------------
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS fraud_score        numeric,
  ADD COLUMN IF NOT EXISTS fraud_risk_level   text CHECK (fraud_risk_level IN ('low','high','extreme','insufficient_data')),
  ADD COLUMN IF NOT EXISTS fraud_flags        jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fraud_case_id      uuid;

-- Fraud case files (the bilingual FraudCaseFile from case_engine)
CREATE TABLE IF NOT EXISTS public.fraud_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id          uuid NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  insurer_id        uuid REFERENCES public.insurers(id) ON DELETE SET NULL,
  flag_type         text,
  severity          text CHECK (severity IN ('low','medium','high','critical')),
  confidence        numeric,
  summary_en        text,
  summary_ar        text,
  key_evidence      jsonb DEFAULT '[]'::jsonb,
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  fraud_score       numeric,
  anomaly_flags     jsonb DEFAULT '[]'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_cases_claim_idx   ON public.fraud_cases(claim_id);
CREATE INDEX IF NOT EXISTS fraud_cases_insurer_idx ON public.fraud_cases(insurer_id);

-- now wire claims.fraud_case_id → fraud_cases.id
ALTER TABLE public.claims
  ADD CONSTRAINT claims_fraud_case_fk
  FOREIGN KEY (fraud_case_id) REFERENCES public.fraud_cases(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- RLS for new tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.doctor_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_cases          ENABLE ROW LEVEL SECURITY;

-- doctor_join_requests: doctor can see/create their own; provider admin can see/manage requests on their org
CREATE POLICY djr_select_own_or_org ON public.doctor_join_requests
  FOR SELECT USING (
    auth.uid() = doctor_id
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid()
                 AND p.account_type = 'provider'
                 AND p.provider_org_id = doctor_join_requests.provider_org_id)
  );
CREATE POLICY djr_insert_own ON public.doctor_join_requests
  FOR INSERT WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY djr_update_admin ON public.doctor_join_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.account_type = 'provider'
              AND p.provider_org_id = doctor_join_requests.provider_org_id)
  );

-- doctor_invitations: provider admin manages; invitee reads only via token (server-mediated)
CREATE POLICY di_select_admin ON public.doctor_invitations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.account_type = 'provider'
              AND p.provider_org_id = doctor_invitations.provider_org_id)
  );
CREATE POLICY di_write_admin ON public.doctor_invitations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.account_type = 'provider'
              AND p.provider_org_id = doctor_invitations.provider_org_id)
  );

-- fraud_cases: insurer staff scoped by insurer_id
CREATE POLICY fc_select_insurer ON public.fraud_cases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.account_type = 'insurance'
              AND p.insurer_id = fraud_cases.insurer_id)
  );
