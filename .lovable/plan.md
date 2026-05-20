## Scope

Twelve features, grouped into three phases. Each phase ships standalone but builds on the previous.

---

## Phase 1 — Polish & quality-of-life

### 1. Inline edit everywhere
- Dashboard "Classes needing attention" rows get inline editors:
  - Click teacher name → popover with text input + "Save".
  - Click childcare gap → toggle "Arranged" inline.
- Same pattern on `/meeting` → Classes needing attention section.
- Single shared component `<InlineClassFixer event={...} />` reused in both places, writes directly via `supabase.from("calendar_events").update(...)`, then invalidates the React Query cache.

### 2. Smart empty states
Audit every list and give it a one-click "add" or next step:
- Calendar with no events → "Add your first event" button.
- Meeting agenda with no items → "+ Add agenda item" + suggestion to pull from last week.
- Action items empty → "Add action item" inline form.
- Dashboard alerts empty → green "All clear ✓" state with link to next week.
- Mission trips, finance reports, sunday reviews, elder agenda, votes log — same treatment.
- New `<EmptyState icon title description action />` component in `src/components/ui/empty-state.tsx`.

### 3. Optimistic UI + undo toasts
- New helper `src/lib/use-undoable-action.ts` wrapping mutations: optimistic update → toast "Deleted. Undo" with 5s timer → on undo, revert; on timeout, commit.
- Wire into: delete event, delete action item, delete agenda item, mark complete, delete mission trip, delete vote, archive interview.
- Uses `sonner` `toast(...)` with `action: { label: "Undo", onClick }`.

### 4. Mobile pass
- Calendar event dialog → full-screen sheet on mobile (`sm:max-w-lg` → `max-sm:h-full max-sm:max-w-full`).
- `/meeting` route → stack sections vertically on mobile, sticky section nav.
- Sidebar → already responsive; audit nav items for touch targets ≥44px.
- Calendar month view → swipe gestures (left/right) for month nav.
- Test viewports: 375×812, 414×896.

---

## Phase 2 — Calendar smarts

### 5. Conflict detection
- New helper `src/lib/event-conflicts.ts`:
  - `findConflicts(event, allEvents)` returns overlaps on **same room** OR **same leader**.
- Show in event dialog as amber banner: "⚠ Conflicts with 'Youth Group' (same room: Sanctuary)".
- Non-blocking — user can save anyway.
- Calendar views: events with conflicts get a red border + tooltip.

### 6. Room / resource booking
- Migration: new `rooms` table (`id`, `name`, `capacity`, `sort_order`) + `event_rooms` join table (`event_id`, `room_id`).
- Seed common rooms: Sanctuary, Fellowship Hall, Kids Wing, Youth Room, Projector, Sound Booth.
- Event dialog: multi-select room picker (replaces the free-text `room_needed` field; keep field for backward compat / notes).
- Conflict detection (#5) reads from `event_rooms`.
- New `/rooms` admin page (core only) to add/rename rooms.

### 7. Recurring-class roster
- Migration: new `class_series` table — groups recurring class events into a series.
  - Fields: `id`, `title`, `default_teacher_name`, `default_teacher_id`, `default_childcare_needed`, `default_childcare_arranged`, `created_by`, timestamps.
  - Add `series_id uuid` to `calendar_events`.
- New `/calendar/classes` page: list of series with edit dialog.
- When creating a recurring class event, prompt: "Save as series?" → creates `class_series` row, links occurrences.
- New occurrences inherit teacher + childcare from series; user can override per occurrence.
- Updating series default offers "Apply to upcoming occurrences" checkbox.

### 11. Event readiness score
- Add `event_readiness_score(event)` to `src/lib/event-readiness.ts`:
  - Class: teacher (25) + childcare resolved (25) + room booked (25) + leader confirmed (25).
  - General event: leader (40) + room (30) + checklist done (30).
  - Returns 0–100 + breakdown of what's missing.
- Display as colored ring on event chips: red <40, amber 40–80, green >80.
- New "Readiness" column on `/calendar` list view, sortable.
- Dashboard widget: "Events needing prep this week" sorted by lowest score.

---

## Phase 3 — Communications & insights

### 8. Voting / decisions log
- Migration: new `decisions` table — `id`, `meeting_id` (nullable), `title`, `motion_text`, `decision_date`, `outcome` (passed/failed/tabled), `vote_yes`, `vote_no`, `vote_abstain`, `notes`, `decided_by` (text — board/elders/staff), `created_by`, timestamps. RLS: core + meeting roles manage; all authenticated read.
- New `/decisions` route: searchable table (filter by date, outcome, decided_by; text search on title + motion).
- New "Record decision" button in `/meeting` and `/elder-meeting` agenda sections → opens dialog, links to current meeting.
- Decisions surface as a section in meeting recap.

### 9. Weekly digest email (Sunday night)
- Lovable Emails: set up email infra + transactional template `staff-weekly-digest`.
  - Sections: This week's events (Mon–Sun), Classes needing attention, Action items due, Decisions from last week, Weekly metrics snapshot.
- Template baked at scaffold time; per-send data passed via `templateData`.
- New `/api/public/hooks/send-weekly-digest` route (apikey-gated):
  - Builds the digest payload from queries.
  - Loops over staff profiles (core + meeting + extended roles), enqueues one email per recipient (same content).
- pg_cron job: Sundays 7pm local time (`0 19 * * 0` UTC-adjusted).
- "Send now" admin button on `/settings` (or new `/admin/email` page) for testing.

### 10. Sunday Review nudges by role
- New `sunday_review_nudges` table: `role`, `section_key` (sermon/worship/connect/confession), `assigned_to` (uuid, nullable).
  - Defines who should fill which section of the Sunday Review (e.g. worship lead → worship section).
- Admin UI on `/settings` to assign people to sections.
- Existing weekly digest (#9) includes a "Your Sunday Review section is due" line per recipient (this is the only personalization).
- In-app: dashboard widget for each user shows "Your Sunday Review section for {date} is open".

### 12. Attendance trends dashboard
- Data source: existing `weekly_metrics` (via `getWeeklyMetrics` server fn — already wired into home page).
- New `/trends` route:
  - Small-multiple line charts using `recharts` (already a dep): total attendance, sanctuary, kids, internal giving, community groups, first-step cards, next-step cards, prayer count, volunteers added.
  - 12-month rolling window by default; toggles for 6m / 12m / 24m / all.
  - Each chart shows current value, trailing-4-week avg, and YoY delta (% vs same week last year).
  - Annotations for `is_special_sunday` and `service_canceled` weeks.
- Pull data via existing `fetchWeeksInRange`.
- Add `/trends` link to sidebar nav.

---

## Technical notes

**Migrations (Phase 2 + 3):**
- `rooms` (id, name, capacity, sort_order)
- `event_rooms` (event_id, room_id)
- `class_series` (id, title, default_teacher_name, default_teacher_id, default_childcare_needed, default_childcare_arranged)
- `calendar_events.series_id uuid`
- `decisions` (full schema above)
- `sunday_review_nudges` (role, section_key, assigned_to)

All new tables: RLS enabled. Read = all authenticated. Write = `core` (or `core` + `meeting` where relevant).

**No new external services.** Weekly digest uses Lovable Emails (already partially configured via `EMAIL_FROM_ADDRESS` + `RESEND_API_KEY` secrets — will use Lovable Email infrastructure, not raw Resend). Cron uses existing pg_cron pattern.

**Files to create (high level):**
- `src/components/ui/empty-state.tsx`
- `src/components/inline/InlineClassFixer.tsx`
- `src/lib/use-undoable-action.ts`
- `src/lib/event-conflicts.ts`
- `src/lib/event-readiness.ts`
- `src/routes/rooms.tsx`, `src/routes/calendar.classes.tsx`, `src/routes/decisions.tsx`, `src/routes/trends.tsx`
- `src/lib/email-templates/staff-weekly-digest.tsx`
- `src/routes/api/public/hooks/send-weekly-digest.ts`

**Out of scope (deferred):**
- Per-person digest personalization (you chose same digest to all).
- Auto-assignment of teachers/volunteers.
- SMS reminders.
- Real-time conflict checks during drag-and-drop (calendar isn't drag-and-drop yet).

---

## Suggested implementation order

1. Phase 1 (polish) — ~1 day of edits, immediate UX uplift, no migrations.
2. Phase 2 (calendar smarts) — biggest behavioral changes, 3 migrations.
3. Phase 3 (comms & insights) — email infra setup is the biggest single step.

Approve and I'll start with Phase 1.
