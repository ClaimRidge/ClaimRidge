-- ============================================================
-- ClaimRidge: ALL MIGRATIONS IN ONE FILE
-- Run this ONCE in Supabase SQL Editor
-- Order: insurer_profiles → clinic_profiles → insurer_claims → adjudication_rules → seed data
-- ============================================================

-- ============================================================
-- STEP 1: Ensure insurer_profiles exists
-- ============================================================
CREATE TABLE IF NOT EXISTS insurer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_name_ar TEXT,
  license_number TEXT,
  payer_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE insurer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own insurer profile" ON insurer_profiles;
CREATE POLICY "Users can read own insurer profile"
  ON insurer_profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own insurer profile" ON insurer_profiles;
CREATE POLICY "Users can insert own insurer profile"
  ON insurer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own insurer profile" ON insurer_profiles;
CREATE POLICY "Users can update own insurer profile"
  ON insurer_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Add payer_code if it doesn't exist
ALTER TABLE insurer_profiles ADD COLUMN IF NOT EXISTS payer_code TEXT;
CREATE INDEX IF NOT EXISTS idx_insurer_profiles_payer_code ON insurer_profiles(payer_code);

-- ============================================================
-- STEP 2: Ensure clinic_profiles exists
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_name TEXT NOT NULL,
  clinic_name_ar TEXT,
  license_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE clinic_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own clinic profile" ON clinic_profiles;
CREATE POLICY "Users can read own clinic profile"
  ON clinic_profiles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own clinic profile" ON clinic_profiles;
CREATE POLICY "Users can insert own clinic profile"
  ON clinic_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own clinic profile" ON clinic_profiles;
CREATE POLICY "Users can update own clinic profile"
  ON clinic_profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_clinic_profiles_user_id ON clinic_profiles(user_id);

-- ============================================================
-- STEP 3: Auto-profile creation trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := coalesce(new.raw_user_meta_data->>'role', 'clinic');
  v_company TEXT := coalesce(new.raw_user_meta_data->>'company_name', 'Unnamed');
  v_company_ar TEXT := new.raw_user_meta_data->>'company_name_ar';
BEGIN
  IF v_role = 'insurer' THEN
    INSERT INTO public.insurer_profiles (user_id, company_name, company_name_ar)
    VALUES (new.id, v_company, v_company_ar)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.clinic_profiles (user_id, clinic_name, clinic_name_ar)
    VALUES (new.id, v_company, v_company_ar)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STEP 4: Insurer claims table
-- ============================================================
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
  adjudication_result JSONB,
  triggered_rules TEXT[],
  denial_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurer_claims_insurer_status_idx ON insurer_claims(insurer_id, status);
CREATE INDEX IF NOT EXISTS insurer_claims_submitted_idx ON insurer_claims(submitted_at DESC);

-- ============================================================
-- STEP 5: Claim flags table
-- ============================================================
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

-- ============================================================
-- STEP 6: RLS for insurer_claims and claim_flags
-- ============================================================
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

-- ============================================================
-- STEP 7: Adjudication rules table
-- ============================================================
CREATE TABLE IF NOT EXISTS adjudication_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  insurer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'cpt_requires_modifier',
    'cpt_not_covered',
    'dx_not_covered',
    'dx_cpt_mismatch',
    'amount_threshold',
    'requires_preauth',
    'duplicate_claim',
    'frequency_limit'
  )),
  rule_params JSONB NOT NULL DEFAULT '{}',
  action TEXT NOT NULL CHECK (action IN ('auto_deny', 'flag_for_review', 'require_auth', 'auto_approve')),
  denial_code TEXT,
  denial_reason TEXT,
  is_active BOOLEAN DEFAULT true
);

ALTER TABLE adjudication_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insurer_own_rules" ON adjudication_rules;
CREATE POLICY "insurer_own_rules" ON adjudication_rules
  FOR ALL USING (insurer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_adj_rules_insurer ON adjudication_rules(insurer_id);
CREATE INDEX IF NOT EXISTS idx_adj_rules_active ON adjudication_rules(insurer_id, is_active);
