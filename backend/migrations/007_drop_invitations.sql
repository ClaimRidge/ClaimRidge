-- ============================================================================
-- Migration 007 — Drop the doctor_invitations table
-- ----------------------------------------------------------------------------
-- Email invitations were removed from the prototype. Doctors join organisations
-- via the org_code → pending join request → admin approval flow only. The
-- invitation feature will be re-added in the future with real email delivery.
-- ============================================================================

DROP TABLE IF EXISTS public.doctor_invitations CASCADE;
