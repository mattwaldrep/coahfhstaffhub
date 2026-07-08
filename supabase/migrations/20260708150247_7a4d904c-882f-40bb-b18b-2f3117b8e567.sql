CREATE OR REPLACE FUNCTION public.guard_ministry_budget_submissions_owner_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'core'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.feedback_body IS DISTINCT FROM OLD.feedback_body
     OR NEW.rough_status IS DISTINCT FROM OLD.rough_status
     OR NEW.sheet_status IS DISTINCT FROM OLD.sheet_status
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.cycle_id IS DISTINCT FROM OLD.cycle_id THEN
    RAISE EXCEPTION 'Not permitted: reviewer/ownership fields are reviewer-only';
  END IF;

  RETURN NEW;
END;
$function$;