-- ClaimRidge — Audit Trail
-- Run this in your Supabase SQL Editor after supabase-schema.sql

-- Audit log: one row per AI scrub run.
create table if not exists public.claim_audit_log (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  claim_id uuid references public.claims(id) on delete cascade not null,
  claim_reference_number text not null,
  patient_name text not null,
  date_of_service date,
  provider_name text,
  payer_name text,
  diagnosis_codes text[] not null default '{}',
  procedure_codes text[] not null default '{}',
  billed_amount numeric(12,2) not null default 0,
  scrub_status text,             -- clean | warnings | errors (from AI)
  scrub_score integer,           -- 0-100
  ai_flags jsonb not null default '[]'::jsonb,       -- issues the AI found
  ai_corrections jsonb not null default '{}'::jsonb, -- corrected_claim payload
  export_count integer not null default 0,
  created_at timestamptz default now() not null
);

-- Row Level Security
alter table public.claim_audit_log enable row level security;

create policy "Users can view own audit log"
  on public.claim_audit_log for select
  using (auth.uid() = user_id);

create policy "Users can insert own audit log"
  on public.claim_audit_log for insert
  with check (auth.uid() = user_id);

create policy "Users can update own audit log"
  on public.claim_audit_log for update
  using (auth.uid() = user_id);

-- Indexes
create index if not exists cal_user_id_idx on public.claim_audit_log(user_id);
create index if not exists cal_claim_id_idx on public.claim_audit_log(claim_id);
create index if not exists cal_created_at_idx on public.claim_audit_log(created_at desc);
create index if not exists cal_payer_name_idx on public.claim_audit_log(payer_name);
create index if not exists cal_date_of_service_idx on public.claim_audit_log(date_of_service);
create index if not exists cal_reference_idx on public.claim_audit_log(claim_reference_number);

-- Atomic export counter RPC (safe under concurrent exports)
create or replace function public.increment_export_count(p_claim_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  new_count integer;
begin
  update public.claim_audit_log
     set export_count = export_count + 1
   where claim_id = p_claim_id
     and user_id = auth.uid()
  returning export_count into new_count;
  return coalesce(new_count, 0);
end;
$$;
