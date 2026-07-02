
CREATE POLICY "Core manages budget reports"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'budget-reports' AND public.has_role(auth.uid(), 'core'))
  WITH CHECK (bucket_id = 'budget-reports' AND public.has_role(auth.uid(), 'core'));

CREATE POLICY "Leaders view own budget reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'budget-reports'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
