ALTER TABLE public.elder_joint_deacon_items
  DROP CONSTRAINT IF EXISTS elder_joint_deacon_items_sub_section_check;

ALTER TABLE public.elder_joint_deacon_items
  ADD CONSTRAINT elder_joint_deacon_items_sub_section_check
  CHECK (sub_section IN ('need_to_know', 'resource', 'upcoming', 'other'));