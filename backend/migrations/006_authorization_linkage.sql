-- ============================================================================
-- Migration 006 — Authorization linkage between pre-auth and claims
-- ----------------------------------------------------------------------------
-- Pre-auth and claims are now connected by a real authorization number issued
-- on approval. A claim references the auth that authorised it; we check the
-- claim falls within the auth's validity window and approved procedure codes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pre_auth_requests: issue an authorization number on approval
-- ---------------------------------------------------------------------------
ALTER TABLE public.pre_auth_requests
  ADD COLUMN IF NOT EXISTS authorization_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS valid_until          timestamptz,
  ADD COLUMN IF NOT EXISTS approved_procedures  jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_visits      integer,
  ADD COLUMN IF NOT EXISTS approved_los_days    integer,
  ADD COLUMN IF NOT EXISTS issued_at            timestamptz;

CREATE INDEX IF NOT EXISTS pre_auth_authorization_number_idx
  ON public.pre_auth_requests(authorization_number)
  WHERE authorization_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- claims: link to authorising pre-auth + persist auth check verdict
-- ---------------------------------------------------------------------------
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS pre_auth_id      uuid REFERENCES public.pre_auth_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pre_auth_number  text,
  ADD COLUMN IF NOT EXISTS auth_check_status text CHECK (
    auth_check_status IS NULL
    OR auth_check_status IN ('ok','missing','expired','code_mismatch','wrong_patient','not_applicable')
  ),
  ADD COLUMN IF NOT EXISTS auth_check_detail text;

CREATE INDEX IF NOT EXISTS claims_pre_auth_id_idx ON public.claims(pre_auth_id)
  WHERE pre_auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS claims_pre_auth_number_idx ON public.claims(pre_auth_number)
  WHERE pre_auth_number IS NOT NULL;
