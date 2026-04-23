-- ============================================================
-- Insurer Claims + AI Flags
-- Run in Supabase SQL Editor
-- ============================================================

-- Claims submitted by clinics, received by insurers
CREATE TABLE IF NOT EXISTS insurer_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number TEXT UNIQUE NOT NULL,
  clinic_id UUID REFERENCES clinic_profiles(id) ON DELETE SET NULL,
  clinic_name TEXT NOT NULL,
  insurer_id UUID REFERENCES insurer_profiles(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_national_id TEXT,
  patient_dob DATE,
  patient_gender TEXT CHECK (patient_gender IN ('M', 'F')),
  diagnosis_codes TEXT[] NOT NULL DEFAULT '{}',
  diagnosis_description TEXT,
  procedure_codes TEXT[] NOT NULL DEFAULT '{}',
  procedure_description TEXT,
  service_date DATE NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  amount_jod NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'needs_info')),
  ai_risk_score INT CHECK (ai_risk_score BETWEEN 0 AND 100),
  ai_recommendation TEXT CHECK (ai_recommendation IN ('auto_approve', 'review', 'likely_reject')),
  decision_reason TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurer_claims_insurer_status_idx ON insurer_claims(insurer_id, status);
CREATE INDEX IF NOT EXISTS insurer_claims_submitted_idx ON insurer_claims(submitted_at DESC);

-- AI-generated flags attached to a claim
CREATE TABLE IF NOT EXISTS claim_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES insurer_claims(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN (
    'code_mismatch',
    'amount_anomaly',
    'duplicate_service',
    'missing_documentation',
    'provider_pattern',
    'pre_auth_missing',
    'coverage_limit'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_flags_claim_idx ON claim_flags(claim_id);

-- RLS
ALTER TABLE insurer_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insurers read their claims" ON insurer_claims;
CREATE POLICY "Insurers read their claims" ON insurer_claims FOR SELECT
  USING (insurer_id IN (SELECT id FROM insurer_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Insurers update their claims" ON insurer_claims;
CREATE POLICY "Insurers update their claims" ON insurer_claims FOR UPDATE
  USING (insurer_id IN (SELECT id FROM insurer_profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Insurers read flags on their claims" ON claim_flags;
CREATE POLICY "Insurers read flags on their claims" ON claim_flags FOR SELECT
  USING (claim_id IN (
    SELECT id FROM insurer_claims
    WHERE insurer_id IN (SELECT id FROM insurer_profiles WHERE user_id = auth.uid())
  ));
