
ALTER TABLE public.event_checklist_items
  ADD COLUMN IF NOT EXISTS assignee_id uuid,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS action_item_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS source_event_id uuid,
  ADD COLUMN IF NOT EXISTS source_checklist_item_id uuid;

CREATE INDEX IF NOT EXISTS idx_action_items_source_checklist
  ON public.action_items(source_checklist_item_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_action_item
  ON public.event_checklist_items(action_item_id);

-- Sync done <-> completed between linked rows.
CREATE OR REPLACE FUNCTION public.sync_checklist_to_action()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.action_item_id IS NOT NULL AND NEW.done IS DISTINCT FROM OLD.done THEN
    UPDATE public.action_items
      SET completed = NEW.done, updated_at = now()
      WHERE id = NEW.action_item_id
        AND completed IS DISTINCT FROM NEW.done;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_action_to_checklist()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_checklist_item_id IS NOT NULL AND NEW.completed IS DISTINCT FROM OLD.completed THEN
    UPDATE public.event_checklist_items
      SET done = NEW.completed, updated_at = now()
      WHERE id = NEW.source_checklist_item_id
        AND done IS DISTINCT FROM NEW.completed;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_checklist_to_action ON public.event_checklist_items;
CREATE TRIGGER trg_sync_checklist_to_action
  AFTER UPDATE OF done ON public.event_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_checklist_to_action();

DROP TRIGGER IF EXISTS trg_sync_action_to_checklist ON public.action_items;
CREATE TRIGGER trg_sync_action_to_checklist
  AFTER UPDATE OF completed ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_action_to_checklist();
