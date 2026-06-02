
-- Async elder motions
CREATE TYPE elder_motion_outcome AS ENUM ('open', 'passed', 'failed', 'tied');
CREATE TYPE elder_motion_choice AS ENUM ('yes', 'no', 'abstain');

CREATE TABLE public.elder_motions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz NOT NULL,
  closed_at timestamptz,
  closed_by uuid,
  outcome elder_motion_outcome NOT NULL DEFAULT 'open',
  tally_yes integer NOT NULL DEFAULT 0,
  tally_no integer NOT NULL DEFAULT 0,
  tally_abstain integer NOT NULL DEFAULT 0,
  open_notified_at timestamptz,
  close_notified_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.elder_motions TO authenticated;
GRANT ALL ON public.elder_motions TO service_role;

ALTER TABLE public.elder_motions ENABLE ROW LEVEL SECURITY;

CREATE POLICY motions_select ON public.elder_motions
  FOR SELECT TO authenticated
  USING (has_any_elder_access(auth.uid()));

CREATE POLICY motions_insert ON public.elder_motions
  FOR INSERT TO authenticated
  WITH CHECK (is_full_elder(auth.uid()) AND created_by = auth.uid());

CREATE POLICY motions_update ON public.elder_motions
  FOR UPDATE TO authenticated
  USING (is_full_elder(auth.uid()))
  WITH CHECK (is_full_elder(auth.uid()));

CREATE TRIGGER set_elder_motions_updated_at
  BEFORE UPDATE ON public.elder_motions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.elder_motion_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motion_id uuid NOT NULL REFERENCES public.elder_motions(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  choice elder_motion_choice NOT NULL,
  comment text,
  voted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (motion_id, voter_id)
);

GRANT SELECT, INSERT, UPDATE ON public.elder_motion_votes TO authenticated;
GRANT ALL ON public.elder_motion_votes TO service_role;

ALTER TABLE public.elder_motion_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY motion_votes_select ON public.elder_motion_votes
  FOR SELECT TO authenticated
  USING (has_any_elder_access(auth.uid()));

CREATE POLICY motion_votes_insert ON public.elder_motion_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    is_full_elder(auth.uid())
    AND voter_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.elder_motions m WHERE m.id = motion_id AND m.closed_at IS NULL)
  );

CREATE POLICY motion_votes_update ON public.elder_motion_votes
  FOR UPDATE TO authenticated
  USING (
    is_full_elder(auth.uid())
    AND voter_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.elder_motions m WHERE m.id = motion_id AND m.closed_at IS NULL)
  )
  WITH CHECK (voter_id = auth.uid());

CREATE TRIGGER set_elder_motion_votes_updated_at
  BEFORE UPDATE ON public.elder_motion_votes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_elder_motions_open ON public.elder_motions (deadline_at) WHERE closed_at IS NULL;
CREATE INDEX idx_elder_motion_votes_motion ON public.elder_motion_votes (motion_id);
