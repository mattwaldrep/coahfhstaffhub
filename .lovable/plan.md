## Goal

Fix the reported bug (coahkids user can't click into events) by moving from a hard-coded 4-value sub-calendar enum + "core-only edit" gate to a dynamic **sub-calendars registry** where each sub-calendar has an **owner user** who can add/edit its events, plus core who can still edit everything. All authenticated staff continue to see the full calendar — only *editing* is gated.

Team sub-calendars come from the Serve Leaders module: PCO groups the leaders lead are surfaced as *suggestions* that core approves and assigns an owner to.

## Data model

New table `public.calendar_sub_calendars`:
- `key` (text, unique, slug) — replaces the old enum values
- `name`, `color_token` (e.g. `var(--cal-main)`), `sort_order`, `is_active`
- `source`: `system` | `pco_team` | `custom`
- `pco_group_id` (nullable) — for PCO-linked teams
- `owner_user_id` (nullable, → profiles.id) — the one person (besides core) who can add/edit events tagged with this sub-calendar

New table `public.calendar_sub_calendar_suggestions` (PCO-suggested, not-yet-approved teams):
- `pco_group_id`, `group_name`, `first_seen_at`, `dismissed`
- Populated by a background refresh when serve leaders are listed

Migration for existing data (`calendar_events`, `calendar_proposed_events`, `calendar_plan_submissions`, `other_listings[]`):
- Convert `sub_calendar` columns from enum to `text` referencing `calendar_sub_calendars.key`
- Seed rows: `general` (blue, was "Forest Hills Main" — merged with old "general"), `coah_lm`, `youth`
- Rewrite any existing `forest_hills_main` rows → `general`
- Drop the old `sub_calendar` enum type after migration

## Permissions

- **View**: unchanged — any authenticated staff sees all events.
- **Edit** (`calendar_events`, `calendar_proposed_events`):
  - `has_role(auth.uid(), 'core')` → all
  - `auth.uid() = (SELECT owner_user_id FROM calendar_sub_calendars WHERE key = calendar_events.sub_calendar)` → their sub-calendar only
- New security-definer helper `public.can_edit_sub_calendar(_user_id uuid, _key text)` used by RLS and by the client `canEdit` check.
- `serve_leader_admin` role remains scoped to the Serve Leaders hub — it does NOT get calendar edit rights unless also assigned as an owner.

## Server functions (`src/lib/sub-calendars.functions.ts` — new)

- `listSubCalendars()` — all active sub-calendars with owner info (any authenticated staff)
- `createSubCalendar({ name, color_token, owner_user_id?, source, pco_group_id? })` — core only
- `updateSubCalendar({ id, name?, color_token?, owner_user_id?, is_active? })` — core only
- `deleteSubCalendar({ id })` — core only; blocked if events reference it (offer reassign)
- `listPcoTeamSuggestions()` — core only; unapproved PCO groups from serve leaders
- `approveSuggestion({ pco_group_id, owner_user_id })` — core only; creates a `pco_team` sub-calendar
- `dismissSuggestion({ pco_group_id })` — core only
- `refreshPcoTeamSuggestions()` — server-side sweep called when the Serve Leaders list is refreshed; upserts suggestions

## Client changes

- `src/routes/calendar.tsx` — replace static `SUB_CALS` with data from `listSubCalendars` (React Query). `canEdit` for a specific event becomes `hasRole("core") || event.sub_calendar_owner_user_id === user.id`. Gate the top-level "New event" button behind "core OR owns any sub-calendar". In the event form, restrict the sub-calendar select to sub-calendars the user can edit (core sees all).
- `src/routes/calendar_.public.tsx` — same dynamic list (public read via server publishable client).
- New route `src/routes/calendar_.settings.tsx` (core-only) — manage sub-calendars: rename, recolor, assign owner, activate/deactivate, plus a "PCO team suggestions" panel with Approve/Dismiss actions.
- Add a sidebar link "Calendar settings" visible to core, and a "Suggested teams (N)" badge when there are pending suggestions.
- `src/lib/calendar.functions.ts` — replace `z.enum([...])` with a runtime lookup against `calendar_sub_calendars` (validator queries the table).

## Bug fix path

Coahkids user (`coahkids@coahforesthills`) → after migration, core opens `/calendar/settings`, approves the PCO "Kids" team suggestion, assigns coahkids as the owner. That user can then click into events tagged with Kids to edit, and can create new Kids events. Any other staff can still view.

## Rollout

1. Migration: create tables + helper + policies; migrate enum → text; seed system rows.
2. Server functions + settings route.
3. Wire calendar UI to dynamic list + per-event `canEdit`.
4. Wire Serve Leaders refresh to populate suggestions.
5. Verify build; smoke-test with a non-core user assigned as owner.

## Out of scope (call out, don't build)

- Per-sub-calendar view filtering (user explicitly wants everyone to see all).
- Multiple owners per sub-calendar (single owner + core, per the choice made).
- Renaming/deleting `pco_team` sub-calendars beyond activating/deactivating (name follows PCO).
