-- ============================================================
-- Adjudication Rules Engine
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add payer_code to insurer_profiles if not present
ALTER TABLE insurer_profiles ADD COLUMN IF NOT EXISTS payer_code TEXT;
CREATE INDEX IF NOT EXISTS idx_insurer_profiles_payer_code ON insurer_profiles(payer_code);

-- 2. Adjudication rules table
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

-- 3. Add adjudication tracking columns to insurer_claims
ALTER TABLE insurer_claims ADD COLUMN IF NOT EXISTS adjudication_result JSONB;
ALTER TABLE insurer_claims ADD COLUMN IF NOT EXISTS triggered_rules TEXT[];
ALTER TABLE insurer_claims ADD COLUMN IF NOT EXISTS denial_code TEXT;
