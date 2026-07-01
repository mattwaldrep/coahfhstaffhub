ALTER TABLE public.ministry_action_plans
  ADD COLUMN IF NOT EXISTS campus text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '';