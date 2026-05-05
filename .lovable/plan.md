# Elder Hub — Full Build Plan

A parallel section of the app with its own nav, meetings, data, and tier-based access. Calendar and Metrics are shared with Staff Hub.

## 1. Roles & access model

Add two new roles to the existing `app_role` enum: `elder` (Full Elder Access) and `elder_candidate`. Existing `core` / `meeting` / `extended` are unchanged.

- Users with `elder` or `elder_candidate` see the Elder Hub.
- Users with `core` / `meeting` / `extended` see the Staff Hub.
- Users with both see both, with a top-level Hub switcher.
- Only `elder` users can mark Executive Session, invite/assign elder roles, and see Exec content.
- The Users page (`/users`) gets a new "Grant Elder Access" / "Grant Elder Candidate" control, restricted to `elder` (and `core` for bootstrap).

Helper: `is_full_elder(uid)` security-definer SQL function.

## 2. Database schema (one migration)

Tables (all RLS-enabled, all gated through `is_full_elder` / `has_role(elder_candidate)`):

- `elder_meetings` — id, meeting_date, meeting_type ('standard' | 'joint'), title, status, completed_at, recap_sent_at, created_by, agenda jsonb, notes
- `elder_meeting_attendees` — meeting_id, user_id, attendee_kind ('elder' | 'candidate'), present bool
- `elder_agenda_items` — meeting_id, section_key, position, title, body, owner_id, status, executive_session bool, source ('carryover' | 'new'), created_by
- `elder_section_notes` — meeting_id, section_key, notes, executive_session bool
- `elder_action_items` — same shape as `action_items` + `executive_session` bool, `meeting_id` → elder_meetings, google_task fields
- `elder_next_meeting_seed` — items queued for the next meeting (carry-forward)
- `pastoral_care_entries` — id, person_name, assigned_elder_id, status ('active'|'monitoring'|'resolved'), date_added, notes, executive_session bool
- `pastoral_care_updates` — entry_id, author_id, body, executive_session bool, created_at
- `member_interviews` — candidate_name, assigned_elder_ids uuid[], status ('not_started'|'scheduled'|'complete'), notes, executive_session bool
- `membership_followups` — person_name, assigned_elder_id, last_contact_date, status ('active'|'resolved'), notes, executive_session bool
- `elder_joint_deacon_items` — meeting_id, sub_section ('need_to_know'|'resource'|'upcoming'), position, title, body, executive_session bool
- `elder_meeting_archive` — read-only historical imports: meeting_date, meeting_type, attendees jsonb, agenda jsonb, action_items jsonb, source_url

Realtime enabled on: `elder_meetings`, `elder_agenda_items`, `elder_section_notes`, `elder_action_items`, `elder_joint_deacon_items`, `pastoral_care_entries`.

### RLS principles (enforced at DB level)

- All elder-domain tables: `SELECT` requires `elder` OR `elder_candidate` role.
- Rows where `executive_session = true`: `SELECT` requires `elder` (candidates literally cannot read them).
- `INSERT` / `UPDATE` of `executive_session = true` requires `elder`.
- All write policies on elder data require at least `elder_candidate`; destructive/admin ops require `elder`.
- `elder_meeting_archive`: read-only for both tiers; only `elder` can insert (used by import script).

## 3. Server functions (`src/server/elder.functions.ts` + `pastoral-care.functions.ts` + `elder-email.functions.ts`)

CRUD for meetings, agenda items, action items, pastoral care, interviews, follow-ups. All call `requireSupabaseAuth`. Server enforces:

- Strip `executive_session` rows from any payload returned to a non-elder before sending (defense in depth on top of RLS).
- `markExecutiveSession` — only `elder`.
- `pushElderActionItemToGoogleTasks` — reuses existing Google Tasks integration, but skips push for candidates when item is exec.
- `createNextElderMeeting` — pulls unresolved action items + `elder_next_meeting_seed` into the new meeting's agenda.
- `sendElderBriefing` / `sendElderRecap` — generates two versions (Full / Standard) and sends via Resend; recipient list filtered by role; exec content stripped from the Standard version.

## 4. Routes

```
src/routes/
  _hub.tsx              -- shared shell: top hub switcher (Staff | Elder), sidebar slot
  _hub/staff/...        -- existing routes moved under here (calendar/finance/etc untouched in URL via aliases)
  elder.tsx             -- /elder layout with Elder sidebar
  elder.index.tsx       -- /elder home
  elder.meetings.tsx    -- /elder/meetings list + create
  elder.meetings.$id.tsx -- /elder/meetings/:id (live meeting view)
  elder.pastoral-care.tsx -- /elder/pastoral-care
  elder.archive.tsx     -- /elder/archive (historical)
  elder.settings.tsx    -- /elder/settings (auto-comm toggles, Exec defaults)
```

Shared modules (`/calendar`, `/sunday-review`, `/finance` for staff, `/` dashboard) stay where they are. The Elder Hub sidebar links to `/calendar` (shared) and a `/elder` view of metrics that reuses the existing metrics components.

To minimize churn we keep existing staff routes at their current paths and only **add** elder routes; the "hub switcher" is a header control that just changes the visible sidebar/home.

## 5. UI components

`src/components/elder/`:

- `ElderShell.tsx` — sidebar + hub switcher, only renders if user has elder access
- `MeetingHeader.tsx` — date/time/location/attendees
- `AgendaSection.tsx` — generic section with notes + items, exec-session toggle (elders only)
- `JointDeaconBlock.tsx` — three structured sub-sections (need_to_know / resource / upcoming), only renders for `meeting_type='joint'`
- `ExecutiveSessionBadge.tsx` — dark-bordered badge, only ever rendered for elders
- `PastoralCarePanel.tsx` — list (active+monitoring), inline add/update/reassign; PCO external links
- `MemberInterviewList.tsx` / `MembershipFollowupList.tsx`
- `ElderActionItems.tsx` — assignee/due/Google Tasks push, exec toggle
- `RealtimeProvider.tsx` — subscribes to relevant realtime channels, candidates only subscribe to non-exec rows (RLS does the filtering, so the channel literally never delivers exec rows to them)

Visual identifier: subtle deep-indigo accent + "Elder Hub" wordmark in the header to distinguish from Staff Hub's brand blue. Same typography/spacing tokens.

## 6. Executive Session enforcement

Three layers:
1. **RLS** — candidates' Supabase queries never return exec rows.
2. **Server functions** — re-filter exec rows before responding (belt + suspenders).
3. **Client** — components never receive exec rows for candidates, so the DOM literally has no placeholder/lock/reference.

Realtime subscriptions inherit RLS, so candidates' channels never emit exec inserts/updates.

## 7. Realtime

Use the existing Supabase realtime pattern. Add `ALTER PUBLICATION supabase_realtime ADD TABLE ...` for each elder table that needs live updates. Each meeting view subscribes to:
- `elder_agenda_items` filtered by `meeting_id=eq.{id}`
- `elder_section_notes` filtered by `meeting_id=eq.{id}`
- `elder_action_items` filtered by `meeting_id=eq.{id}`
- `elder_joint_deacon_items` filtered by `meeting_id=eq.{id}` (joint only)

## 8. Automated communication

New table `elder_email_settings` (one row, edited by elders): briefing_enabled, recap_enabled, send_time. Two cron-callable public routes:

- `/api/public/hooks/elder-briefing` — morning of each scheduled elder meeting
- `/api/public/hooks/elder-recap` — fires when a meeting is marked complete (also callable manually)

Both protected by `CRON_SHARED_SECRET`. Use existing `email.server.ts` (Resend). Two templates per email (Full / Standard).

## 9. AI assistant scoping

Existing `ai-chat` edge function gets an `elder_mode` flag. When the caller is an elder, query elder data including exec rows. When the caller is a candidate, query elder data with exec rows excluded. Server-side filter — never trust the client.

## 10. History import

Build a one-time admin tool at `/elder/archive` (visible to elders only) with a paste-area + "Import historical meetings" action. We'll fetch the Google Doc you shared via the Google Docs connector, parse it into archive rows, and bulk-insert into `elder_meeting_archive`. Records render read-only, searchable by date/title/attendee.

I'll need the Google Doc URL pasted in chat once we're ready to run the import (after the schema is in place).

## 11. Home screens

- Elder-only user: Elder Hub home — next meeting, my action items, my pastoral care entries, calendar, latest metrics summary.
- Both-access user: combined dashboard with two clearly divided columns ("Staff" | "Elder Hub") and a hub switcher in the header.
- Staff-only: unchanged.

## Technical sequencing

1. **Migration** (schema + RLS + realtime publication + helper fn) — single migration, ~600 lines SQL.
2. **Server functions** — elder.functions.ts, pastoral-care.functions.ts, elder-email.functions.ts.
3. **Routes + components** — elder shell, hub switcher, meetings list/detail, pastoral care, archive, settings.
4. **Realtime + Google Tasks integration** wiring inside the meeting view.
5. **Cron hooks** for briefing/recap.
6. **AI chat scoping** update.
7. **History import** (after you share the doc URL).

## Out of scope confirmations

- No deacon accounts, no deacon views, no separate deacon summaries — Joint meeting is just an elder-side template.
- Deacon Portion uses **structured items per sub-section** (add/remove with title + body), as you confirmed.
- Initial elder role assignments will be done manually by you in the Users page after deploy.

---

Reply "go" and I'll start with the migration. Once that's approved I'll ship the rest in one pass and ping you when it's time to import the Google Doc.
