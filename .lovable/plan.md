# Community Group Coaching Hub

A new hub for CG Coaches to see the community groups they're assigned to, view each group's leaders (pulled from PCO Groups), text both leaders at once, and log reach-outs — mirroring the elder Pastoral Care patterns.

## What's new for the user

- **New role: CG Coach.** Tag users as coaches from the existing user-roles UI.
- **New sidebar section: "CG Coaching"** with one page (`/cg-coaching`) gated to coaches.
- **Settings tab (coach admin only):** pick the PCO Group Type that represents community groups; assign each group to a coach.
- **Group list page (like Pastoral Care):**
  - Search + sort + "My groups" filter.
  - For each group: name, assigned coach, leaders (name + phone).
  - **Text button** opens the SMS app pre-addressed to **all leaders of that group** (multi-recipient `sms:` link).
  - **Reach-out log** (same UX as pastoral care): record text/call/email/in-person/other against the group, view history, delete your own entries.

## Data model

- Add `cg_coach` to the `app_role` enum.
- New table `cg_pco_config` (singleton row): `group_type_id`. Editable by users with `cg_coach` role.
- New table `cg_coach_assignments`: `group_id` (PCO id, unique), `coach_user_id` (auth user). Coaches can read all; only coach admins (or all coaches — see open question) can assign.
- New table `cg_touchpoints`: `group_id`, `group_name`, `user_id`, `kind` (same enum as `pco_touchpoints`), `note`, `created_at`. RLS: coaches read all; insert as self; delete own.

All three tables get standard `GRANT` to `authenticated` + `service_role`, RLS enabled, plus a `has_any_cg_access` / role check helper.

## PCO integration

Extend `src/server/pco.server.ts` with Groups endpoints (separate base `groups/v2`):

- `listGroupsByType(group_type_id)` — paginated, returns id + name.
- `listGroupLeaders(group_id)` — `GET /groups/{id}/memberships?where[role]=leader&include=person` (then phone numbers via people endpoint or included). Returns `{ person_id, name, phone }[]`.
- Cache results in-process for ~60s like the care-list cache.

Auth uses existing `PCO_APP_ID` / `PCO_SECRET`. The Groups API requires the Groups product to be enabled on the PCO account — surface a clear error if it returns 403.

## Server functions (`src/lib/cg-coaching.functions.ts`)

All gated by a `requireCgAccess` helper (role = `cg_coach` OR `elder` for visibility, TBD — see open question).

- `getCgConfig` / `saveCgConfig` (group_type_id).
- `listPcoGroupTypes` — for the settings dropdown.
- `listCoachGroups({ refresh })` — returns groups merged with assignments + leaders + phones.
- `assignCoach({ group_id, coach_user_id | null })`.
- `listCoaches` — users with `cg_coach` role for the assignment dropdown.
- `logGroupTouchpoint` / `listGroupTouchpoints` / `deleteGroupTouchpoint` — direct analogs of the pastoral ones.

## UI

```
src/routes/cg-coaching.tsx              # main list (gated)
src/routes/cg-coaching.settings.tsx     # group-type + coach assignments
src/components/cg-coaching/
  CoachGroupList.tsx                    # adapted from PastoralCareList
  GroupRow.tsx                          # name, coach, leaders, text + log buttons
  GroupReachOutLog.tsx                  # adapted from pastoral touchpoint log
  TextLeadersButton.tsx                 # builds sms:+1...,+1...?&body=...
```

SMS link format: `sms:/open?addresses=+15551112222,+15553334444` on iOS, and falls back to `sms:+15551112222,+15553334444` — same approach already used by the pastoral "Text" button (we'll reuse that helper if it exists, else co-locate it).

Sidebar: add a "CG Coaching" entry in `AppSidebar.tsx`, shown only when the current user has `cg_coach` role (extend `useAuth` with `isCgCoach`).

## Out of scope (confirm if you want these)

- Notes / "spiritual health" field per group — not requested; only reach-out log.
- Editing PCO group data — read-only from PCO.
- Coaching-specific dashboard widgets (forgotten-group alarm, pulse contribution).

## Open questions

1. **Who can assign coaches to groups?** Options: (a) any `cg_coach`, (b) only elders, (c) a new `cg_coach_admin` role. Default in plan: any `cg_coach` (simplest, matches small-team reality).
2. **Should elders also see the CG Coaching hub read-only?** Default: no — coaches only. Elders can be granted the role explicitly.
3. **Group type picker:** assume a single PCO Group Type for "Community Groups". Confirm — if you have multiple types (e.g. CGs + Men's Groups), I'll make it multi-select.

Reply with answers (or "go with defaults") and I'll build it.
