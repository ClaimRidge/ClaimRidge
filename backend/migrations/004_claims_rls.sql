-- ============================================================================
-- 004_claims_rls.sql
--
-- Adds row-level-security policies to the claim tables so authenticated users
-- can read their own claims, and the insurer staff can read claims routed to
-- their insurer. Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.claims        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claim_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims_audit  ENABLE ROW LEVEL SECURITY;

-- ---- claims ----
DROP POLICY IF EXISTS claims_select_submitter   ON public.claims;
DROP POLICY IF EXISTS claims_select_org_staff   ON public.claims;
DROP POLICY IF EXISTS claims_select_insurer     ON public.claims;
DROP POLICY IF EXISTS claims_insert_submitter   ON public.claims;
DROP POLICY IF EXISTS claims_update_submitter   ON public.claims;
DROP POLICY IF EXISTS claims_update_insurer     ON public.claims;

-- The submitting user can read their own claims.
CREATE POLICY claims_select_submitter ON public.claims
  FOR SELECT USING (auth.uid() = user_id);

-- Provider admins can read every claim billed under their org.
CREATE POLICY claims_select_org_staff ON public.claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_type = 'provider'
        AND p.provider_org_id = claims.clinic_id
    )
  );

-- Insurer staff can read claims routed to their insurer.
CREATE POLICY claims_select_insurer ON public.claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_type = 'insurance'
        AND p.insurer_id = claims.payer_id
    )
  );

-- The submitter can insert/update their own claim drafts.
CREATE POLICY claims_insert_submitter ON public.claims
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY claims_update_submitter ON public.claims
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Insurer staff can update the workflow fields (status, notes) on claims they own.
CREATE POLICY claims_update_insurer ON public.claims
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.account_type = 'insurance'
        AND p.insurer_id = claims.payer_id
    )
  );

-- ---- claim_lines ----
DROP POLICY IF EXISTS claim_lines_select_via_parent ON public.claim_lines;
CREATE POLICY claim_lines_select_via_parent ON public.claim_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.claims c WHERE c.id = claim_lines.claim_id)
  );

-- ---- claims_audit ----
DROP POLICY IF EXISTS claims_audit_select_own ON public.claims_audit;
CREATE POLICY claims_audit_select_own ON public.claims_audit
  FOR SELECT USING (auth.uid() = user_id);
