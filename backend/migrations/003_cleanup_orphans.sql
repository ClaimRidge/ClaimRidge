-- ============================================================================
-- 003_cleanup_orphans.sql
--
-- Removes orphaned rows left behind by half-finished signup attempts so you
-- can sign up again with the same license number / email. Safe to run any
-- time — only deletes data that has no live owner.
--
-- Run order:
--   1. Delete orphan provider_orgs (no profile points at them).
--   2. Delete orphan insurers (no profile points at them).
--   3. Delete auth.users that have no profile row (failed signups).
-- ============================================================================

-- 1. Orphan provider organisations
DELETE FROM public.provider_orgs po
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.provider_org_id = po.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.doctor_org_links dol WHERE dol.provider_org_id = po.id
);

-- 2. Orphan insurers (no admin profile linked, no pre-auth requests, no policy chunks)
DELETE FROM public.insurers i
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.insurer_id = i.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.pre_auth_requests par WHERE par.insurer_id = i.id
)
AND NOT EXISTS (
  SELECT 1 FROM public.policy_chunks pc WHERE pc.insurer_id = i.id
);

-- 3. Orphan auth users (created but never got a profile row).
--    CAUTION: this deletes the actual login. Only run if you intentionally
--    want to free up the email address for a fresh signup.
DELETE FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
);
