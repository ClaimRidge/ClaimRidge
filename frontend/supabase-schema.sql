-- ClaimRidge Database Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Claims table
create table if not exists public.claims (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  patient_name text not null,
  patient_id text not null,
  date_of_service date not null,
  provider_name text not null,
  provider_id text not null,
  payer_name text not null,
  payer_id text not null,
  diagnosis_codes text[] not null default '{}',
  procedure_codes text[] not null default '{}',
  billed_amount numeric(12,2) not null default 0,
  notes text default '',
  status text not null default 'pending' check (status in ('pending', 'scrubbed', 'submitted', 'rejected')),
  scrub_result jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Row Level Security
alter table public.claims enable row level security;

-- Users can only see their own claims
create policy "Users can view own claims"
  on public.claims for select
  using (auth.uid() = user_id);

-- Users can insert their own claims
create policy "Users can insert own claims"
  on public.claims for insert
  with check (auth.uid() = user_id);

-- Users can update their own claims
create policy "Users can update own claims"
  on public.claims for update
  using (auth.uid() = user_id);

-- Users can delete their own claims
create policy "Users can delete own claims"
  on public.claims for delete
  using (auth.uid() = user_id);

-- Index for faster queries
create index if not exists claims_user_id_idx on public.claims(user_id);
create index if not exists claims_status_idx on public.claims(status);
create index if not exists claims_created_at_idx on public.claims(created_at desc);
