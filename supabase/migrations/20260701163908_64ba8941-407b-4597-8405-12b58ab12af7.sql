
CREATE TABLE public.onboarding_workflow_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.onboarding_workflows(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, section_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_workflow_sections TO authenticated;
GRANT ALL ON public.onboarding_workflow_sections TO service_role;
ALTER TABLE public.onboarding_workflow_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "core read workflow sections" ON public.onboarding_workflow_sections
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'core'));
CREATE POLICY "core write workflow sections" ON public.onboarding_workflow_sections
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'core')) WITH CHECK (public.has_role(auth.uid(),'core'));

CREATE TABLE public.onboarding_workflow_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.onboarding_workflows(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_workflow_documents TO authenticated;
GRANT ALL ON public.onboarding_workflow_documents TO service_role;
ALTER TABLE public.onboarding_workflow_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "core read workflow docs" ON public.onboarding_workflow_documents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'core'));
CREATE POLICY "core write workflow docs" ON public.onboarding_workflow_documents
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'core')) WITH CHECK (public.has_role(auth.uid(),'core'));
