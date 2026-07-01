
CREATE POLICY "core read onboarding docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'onboarding-documents' AND public.has_role(auth.uid(),'core'));
CREATE POLICY "core insert onboarding docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'onboarding-documents' AND public.has_role(auth.uid(),'core'));
CREATE POLICY "core update onboarding docs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'onboarding-documents' AND public.has_role(auth.uid(),'core'))
  WITH CHECK (bucket_id = 'onboarding-documents' AND public.has_role(auth.uid(),'core'));
CREATE POLICY "core delete onboarding docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'onboarding-documents' AND public.has_role(auth.uid(),'core'));
