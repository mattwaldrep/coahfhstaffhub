create or replace function public.is_calendar_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'calendar_admin'::app_role)
$$;

create or replace function public.can_edit_sub_calendar(_user_id uuid, _key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'core'::app_role)
    or public.has_role(_user_id, 'calendar_admin'::app_role)
    or exists (
      select 1 from public.calendar_sub_calendars
      where key = _key and owner_user_id = _user_id and is_active = true
    )
$$;