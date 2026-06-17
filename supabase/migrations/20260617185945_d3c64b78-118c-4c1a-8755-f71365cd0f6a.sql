
CREATE TABLE public.onboarding_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.onboarding_tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_task_comments_task_idx ON public.onboarding_task_comments(task_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_task_comments TO authenticated;
GRANT ALL ON public.onboarding_task_comments TO service_role;
ALTER TABLE public.onboarding_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Core can view onboarding comments" ON public.onboarding_task_comments
  FOR SELECT USING (has_role(auth.uid(), 'core'::app_role));
CREATE POLICY "Core can add onboarding comments" ON public.onboarding_task_comments
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'core'::app_role) AND author_id = auth.uid());
CREATE POLICY "Author can delete own onboarding comments" ON public.onboarding_task_comments
  FOR DELETE USING (author_id = auth.uid());
