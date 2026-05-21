
CREATE TABLE public.event_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_comments_event ON public.event_comments(event_id, created_at);

ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view event comments"
  ON public.event_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can post own comments"
  ON public.event_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete own comments"
  ON public.event_comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR has_role(auth.uid(), 'core'::app_role));

CREATE POLICY "Authors can edit own comments"
  ON public.event_comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
