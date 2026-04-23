-- ============================================================
-- Two-Sided Auth: clinic_profiles + auto-profile trigger
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Create clinic_profiles table
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

-- 2. Ensure insurer_profiles update policy exists
DROP POLICY IF EXISTS "Users can update own insurer profile" ON insurer_profiles;
CREATE POLICY "Users can update own insurer profile"
  ON insurer_profiles FOR UPDATE USING (auth.uid() = user_id);

-- 3. Trigger: auto-create profile row based on signup metadata
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

-- 4. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clinic_profiles_user_id ON clinic_profiles(user_id);
