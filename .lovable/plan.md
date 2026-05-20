# Continue the 12-feature upgrade

Phase 1 partially landed (inline fixer, undoable hook, empty-state component, dashboard + meeting alerts). Below is the remaining work, grouped so each chunk is shippable on its own.

## Phase 1 — finish polish (no migrations)

1. **Wire `useUndoableAction` into destructive flows**
   - Calendar event delete (`/calendar` dialog "Delete")
   - Action item "Mark complete" and delete on `/meeting`
   - Sunday Review item dismiss
   - Each: optimistic remove from list, 5s toast with Undo, rollback on failure.

2. **Empty states everywhere**
   - Audit lists: calendar day/week with no events, meeting sections (action items, prayer, announcements, Sunday Review), `/decisions` (future), dashboard "Classes needing attention" already done.
   - Each empty list uses `<EmptyState>` with icon, one-line copy, primary action button (e.g. "Add event", "Add action item").

3. **Mobile pass**
   - Calendar event dialog → switch to `Sheet` (bottom) under `md`.
   - `/meeting` sections → single column stack, sticky section nav.
   - Sidebar → confirm Sheet trigger works at 375px; tighten paddings.
   - Calendar month grid → horizontal scroll wrapper + larger touch targets on day cells.
   - Verify on 375x812 with browser tools.

## Phase 2 — calendar smarts (3 migrations)

4. **Conflict detection** (`src/lib/event-conflicts.ts`)
   - Pure function: given events list + candidate event, return conflicts where time overlaps AND (same room OR same `leader_name`).
   - Show amber banner in event dialog + small "!" chip on calendar tiles. Non-blocking.

5. **Rooms & resource booking** (migration 1)
   - New `rooms` table (`name`, `capacity`, `notes`, `active`).
   - New `event_rooms` join (`event_id`, `room_id`).
   - RLS: authenticated read; admin write (reuse existing `has_role`).
   - Seed common rooms. Multi-select picker in event dialog. New `/rooms` admin page (list + add/edit/archive).
   - Feeds into conflict detection.

6. **Recurring-class roster** (migration 2)
   - New `class_series` table (`name`, `weekday`, `start_time`, `end_time`, `default_teacher_name`, `default_childcare_needed`, `default_room_id`, `active`).
   - New `/calendar/classes` admin page.
   - When creating a calendar event tied to a series, prefill from defaults; surface "uses series default" badge.

7. **Event readiness score** (`src/lib/event-readiness.ts`)
   - Class events: teacher(25) + childcare(25) + room(25) + leader(25).
   - General events: leader(40) + room(30) + checklist(30).
   - Show as colored ring on calendar chips and a "Readiness" column on the calendar list view; tooltip explains missing pieces.

## Phase 3 — comms & insights (2 migrations)

8. **Voting / decisions log** (migration 3)
   - New `decisions` table (`meeting_id`, `title`, `motion_text`, `outcome`, `vote_yes`, `vote_no`, `vote_abstain`, `decided_by`, `decided_at`).
   - RLS: authenticated read; recorder write.
   - New `/decisions` route with search + filter by outcome / date / meeting.
   - Inline "Record decision" button inside `/meeting`.

9. **Weekly digest email — same to all staff**
   - Lovable Emails template: this week's events, classes still needing teacher/childcare, open action items, top readiness gaps.
   - Server route `src/routes/api/public/hooks/send-weekly-digest.ts` (apikey-gated via `process.env.DIGEST_WEBHOOK_SECRET`).
   - pg_cron job: Sundays 19:00 local → POSTs to the stable preview/prod URL.
   - Admin "Send digest now" button on `/settings`.

10. **Sunday Review nudges by role** (migration 4)
    - New `sunday_review_nudges` table (`role`, `section`, `weekday_offset`, `active`).
    - Admin UI on `/settings` (per role: which sections they own, when to remind).
    - Digest includes the per-role "Your Sunday Review section is due" line (still one shared email body — each row just lists role assignments).

11. **Attendance trends dashboard** (no migration — uses existing `weekly_metrics`)
    - New `/trends` route.
    - Pull 12 months via existing `fetchWeeksInRange` from `src/integrations/metrics/client.ts`.
    - Small-multiple `recharts` line charts: attendance, giving, first-step cards, etc.
    - YoY delta chips, simple annotations for missing weeks.

## Out of scope (confirmed earlier)
- Per-person digest personalization
- Auto-assignment of teachers
- SMS / push notifications
- Realtime conflict checks during drag-and-drop

## Suggested order
Phase 1 finish → Phase 2 in order (conflicts uses rooms; readiness uses rooms + series) → Phase 3 in order (digest uses decisions + readiness data).
