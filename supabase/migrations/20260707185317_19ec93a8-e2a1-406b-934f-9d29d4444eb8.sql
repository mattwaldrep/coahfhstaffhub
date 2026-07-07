
-- Prevent ministry leaders from tampering with reviewer-controlled fields on their own rows.

-- 1) calendar_plan_submissions
CREATE OR REPLACE FUNCTION public.guard_calendar_plan_submissions_owner_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'core'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id
     OR NEW.reviewer_note IS DISTINCT FROM OLD.reviewer_note
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.leader_id IS DISTINCT FROM OLD.leader_id
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id THEN
    RAISE EXCEPTION 'Not permitted: reviewer/ownership fields are reviewer-only';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('draft'::plan_submission_status, 'submitted'::plan_submission_status) THEN
    RAISE EXCEPTION 'Not permitted: only reviewers can set status beyond draft/submitted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_calendar_plan_submissions_owner_fields ON public.calendar_plan_submissions;
CREATE TRIGGER guard_calendar_plan_submissions_owner_fields
BEFORE UPDATE ON public.calendar_plan_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_calendar_plan_submissions_owner_fields();

-- 2) ministry_action_plans
CREATE OR REPLACE FUNCTION public.guard_ministry_action_plans_owner_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'core'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id THEN
    RAISE EXCEPTION 'Not permitted: reviewer/ownership fields are reviewer-only';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('draft'::ministry_plan_status, 'submitted'::ministry_plan_status) THEN
    RAISE EXCEPTION 'Not permitted: only reviewers can set status beyond draft/submitted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ministry_action_plans_owner_fields ON public.ministry_action_plans;
CREATE TRIGGER guard_ministry_action_plans_owner_fields
BEFORE UPDATE ON public.ministry_action_plans
FOR EACH ROW EXECUTE FUNCTION public.guard_ministry_action_plans_owner_fields();

-- 3) ministry_budget_submissions
CREATE OR REPLACE FUNCTION public.guard_ministry_budget_submissions_owner_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'core'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.feedback_body IS DISTINCT FROM OLD.feedback_body
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id THEN
    RAISE EXCEPTION 'Not permitted: reviewer/ownership fields are reviewer-only';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ministry_budget_submissions_owner_fields ON public.ministry_budget_submissions;
CREATE TRIGGER guard_ministry_budget_submissions_owner_fields
BEFORE UPDATE ON public.ministry_budget_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_ministry_budget_submissions_owner_fields();
