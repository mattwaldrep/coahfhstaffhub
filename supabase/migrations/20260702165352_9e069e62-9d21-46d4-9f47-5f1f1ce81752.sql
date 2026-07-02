-- Enum values must be added in their own transaction before use.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'serve_leader_admin';

-- Onboarding tracker on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;