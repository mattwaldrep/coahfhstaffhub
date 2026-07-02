
-- Governing Documents repository
CREATE TABLE public.governing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  current_version_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.governing_documents TO authenticated;
GRANT ALL ON public.governing_documents TO service_role;
ALTER TABLE public.governing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can view documents"
  ON public.governing_documents FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Core can insert documents"
  ON public.governing_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can update documents"
  ON public.governing_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can delete documents"
  ON public.governing_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'core'));

CREATE TRIGGER governing_documents_updated_at
  BEFORE UPDATE ON public.governing_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.governing_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.governing_documents(id) ON DELETE CASCADE,
  version_label text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.governing_document_versions TO authenticated;
GRANT ALL ON public.governing_document_versions TO service_role;
ALTER TABLE public.governing_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated staff can view versions"
  ON public.governing_document_versions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Core can insert versions"
  ON public.governing_document_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can update versions"
  ON public.governing_document_versions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'core'))
  WITH CHECK (public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can delete versions"
  ON public.governing_document_versions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'core'));

CREATE INDEX governing_document_versions_document_idx
  ON public.governing_document_versions(document_id, created_at DESC);

ALTER TABLE public.governing_documents
  ADD CONSTRAINT governing_documents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.governing_document_versions(id) ON DELETE SET NULL;

-- Storage policies for new bucket "governing-documents" (bucket created separately)
CREATE POLICY "Staff can read governing documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'governing-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Core can upload governing documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'governing-documents' AND public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can update governing documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'governing-documents' AND public.has_role(auth.uid(), 'core'));

CREATE POLICY "Core can delete governing documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'governing-documents' AND public.has_role(auth.uid(), 'core'));

-- Remove old per-workflow docs feature (per user request: delete entirely)
DROP TABLE IF EXISTS public.onboarding_workflow_documents CASCADE;
