CREATE POLICY "Submitter can delete own sunday review"
ON public.sunday_reviews
FOR DELETE
USING (submitted_by = auth.uid());