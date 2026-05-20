-- Add assignment fields to onboarding_tasks
ALTER TABLE public.onboarding_tasks
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS action_item_id uuid;

-- Add source links to action_items so we can sync back
ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS source_onboarding_task_id uuid,
  ADD COLUMN IF NOT EXISTS source_workflow_id uuid;

CREATE INDEX IF NOT EXISTS idx_action_items_source_onboarding_task
  ON public.action_items(source_onboarding_task_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_action_item
  ON public.onboarding_tasks(action_item_id);

-- Sync: onboarding_task.is_completed -> action_item.completed
CREATE OR REPLACE FUNCTION public.sync_onboarding_to_action()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.action_item_id IS NOT NULL AND NEW.is_completed IS DISTINCT FROM OLD.is_completed THEN
    UPDATE public.action_items
      SET completed = NEW.is_completed, updated_at = now()
      WHERE id = NEW.action_item_id
        AND completed IS DISTINCT FROM NEW.is_completed;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_onboarding_to_action ON public.onboarding_tasks;
CREATE TRIGGER trg_sync_onboarding_to_action
  AFTER UPDATE ON public.onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_onboarding_to_action();

-- Sync: action_item.completed -> onboarding_task.is_completed
CREATE OR REPLACE FUNCTION public.sync_action_to_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.source_onboarding_task_id IS NOT NULL AND NEW.completed IS DISTINCT FROM OLD.completed THEN
    UPDATE public.onboarding_tasks
      SET is_completed = NEW.completed,
          completed_at = CASE WHEN NEW.completed THEN now() ELSE NULL END,
          updated_at = now()
      WHERE id = NEW.source_onboarding_task_id
        AND is_completed IS DISTINCT FROM NEW.completed;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_action_to_onboarding ON public.action_items;
CREATE TRIGGER trg_sync_action_to_onboarding
  AFTER UPDATE ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_action_to_onboarding();