
DROP POLICY IF EXISTS "Authenticated staff can view documents" ON public.governing_documents;
DROP POLICY IF EXISTS "Authenticated staff can view versions" ON public.governing_document_versions;
DROP POLICY IF EXISTS "Staff can read governing documents" ON storage.objects;

CREATE POLICY "Staff roles can view documents"
ON public.governing_documents FOR SELECT
USING (public.has_any_role(auth.uid(), ARRAY['core','meeting','elder','elder_candidate','cg_coach','deacon','chair_of_deacons','serve_leader_admin']::app_role[]));

CREATE POLICY "Staff roles can view versions"
ON public.governing_document_versions FOR SELECT
USING (public.has_any_role(auth.uid(), ARRAY['core','meeting','elder','elder_candidate','cg_coach','deacon','chair_of_deacons','serve_leader_admin']::app_role[]));

CREATE POLICY "Staff roles can read governing documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'governing-documents' AND public.has_any_role(auth.uid(), ARRAY['core','meeting','elder','elder_candidate','cg_coach','deacon','chair_of_deacons','serve_leader_admin']::app_role[]));
