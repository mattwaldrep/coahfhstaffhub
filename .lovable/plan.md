## Part 1 — Missing fields from the master sheet

I diffed the `FH MASTER 2026` tab against the current `calendar_events` schema. The sheet has 13 columns; we already cover most, but four were dropped during the migration:


| Sheet column            | Current field     | Status                                                                             |
| ----------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| Date / Time             | start_at / end_at | ✓                                                                                  |
| Event Name              | title             | ✓                                                                                  |
| Category                | category          | ✓                                                                                  |
| Notes                   | description       | ✓                                                                                  |
| Leader                  | leader_name       | ✓                                                                                  |
| PCO Registration?       | pco_registration  | ✓                                                                                  |
| **Other Listings**      | —                 | **missing** — things like google business profile or eventbrite                    |
| Room Needed             | location          | ⚠️ partially — sheet treats it as a discrete room request, not a free-text address |
| **Action**              | —                 | **missing** — open action item / follow-up associated with the event               |
| **Missions Team Need?** | —                 | **missing** — Yes/No flag                                                          |
| **Church Covering**     | —                 | **missing** — which campus/church is hosting                                       |


### Schema additions to `calendar_events`

- `cross_listings text[]` — array of additional sub_calendar enum values
- `room_needed text` (rename of how we surface `location` in the form: keep `location` column, add a dedicated `room_needed` field since several events have both an outside location AND need an internal room)
- `action_note text`
- `missions_team_needed boolean default false`
- `church_covering text` (small enum: e.g. Family Hope, Living Mountain, Both, Other — confirm options when editing)

### UI changes

- Event create/edit dialog (`src/routes/calendar.tsx`): add the four new inputs, grouped under a "Logistics" section. Yes/No fields render as switches with the same styling as `pco_registration`.
- Event detail/popover: show new fields when populated.
- When `cross_listings` is set, the event renders on each listed sub-calendar in the calendar view (filter logic update only — same row in DB).

---

## Part 2 — Annual Calendar Planning workflow

A once-a-year structured submission flow so each ministry leader plans their year inside the app, sees everyone else's draft + the master calendar live, and a reviewer approves into production.

### Concepts

- **Planning Cycle** — admin opens a cycle (e.g. "2027 Annual Planning"), sets `plan_year`, `opens_at`, `closes_at`, `status` (`open` / `review` / `closed`).
- **Plan Submission** — one per leader per sub_calendar per cycle. Status: `draft` → `submitted` → `in_review` → `approved` / `partially_approved` / `rejected`.
- **Proposed Event** — a calendar entry inside a submission. Mirrors `calendar_events` columns. Status: `pending` / `approved` / `rejected` (per-event, with optional reviewer note).

### New tables

- `calendar_planning_cycles` — id, plan_year, title, opens_at, closes_at, status, created_by
- `calendar_plan_submissions` — id, cycle_id, leader_id, sub_calendar, status, submitted_at, reviewed_at, reviewer_id, reviewer_note
- `calendar_proposed_events` — id, submission_id, all the calendar_events columns (incl. the new ones from Part 1), status, reviewer_note, approved_event_id (FK to calendar_events once published)

RLS: leaders can CRUD their own draft submissions; everyone with calendar access can read submitted/approved proposed events (so silos are broken). Only `core` role can manage cycles and approve.

### Pages / routes

- `src/routes/calendar.planning.tsx` — landing page for the active cycle
  - **Banner / dashboard tile on `/calendar**` when a cycle is `open`: "Annual Planning is open — submit your YYYY plan by {closes_at}."
  - Shows the user's own submission(s) with status, and a list of all other submissions in the workspace (read-only) so people can coordinate.
- `src/routes/calendar.planning.$submissionId.tsx` — the planner
  - Split view: left = the leader's proposed events (table + add-event form), right = a read-only mini calendar showing the master calendar + all other pending plans for the same date range, color-coded by sub_calendar with a dotted/striped style for "pending."
  - Inline conflict warnings when a proposed date+room overlaps anything visible.
  - "Submit for review" button locks editing.
- `src/routes/calendar.planning.review.tsx` — reviewer view (core role)
  - List of submissions grouped by sub_calendar; per-submission: bulk Approve all / Reject all, or expand and approve/reject events individually with a note.
  - On approve, the proposed event is inserted into `calendar_events` and `approved_event_id` is set; on reject, it stays archived in the submission.

### Server functions (`src/server/calendar.functions.ts` — new file)

- `listPlanningCycles`, `createPlanningCycle`, `updatePlanningCycle`
- `getActiveCycleForUser`
- `createSubmission`, `updateSubmission`, `submitForReview`
- `addProposedEvent`, `updateProposedEvent`, `deleteProposedEvent`
- `listVisibleProposedEvents({ cycleId, rangeStart, rangeEnd })` — returns everyone's submitted events (for the silo-busting view)
- `reviewSubmission({ submissionId, decisions: [{eventId, decision, note}] })` — atomic; inserts approved ones into `calendar_events`
- `approveAllInSubmission`, `rejectAllInSubmission`

### Notifications (Resend)

- When a cycle opens: email all leaders.
- 7 days and 1 day before `closes_at`: nudge leaders without a submitted plan.
- When a submission is reviewed: email the leader with summary of approved/rejected items.

---

## Recommended order of work

1. Migration: add the 5 new columns to `calendar_events` + the 3 planning tables with RLS.
2. Wire the new fields into the existing event create/edit dialog and detail view.
3. Build planning cycle admin (create/open/close cycles).
4. Build leader planning view (submission editor + cross-visibility).
5. Build reviewer view with bulk + per-event approval.
6. Add cycle-open banner on `/calendar` and email nudges.

Say the word and I'll implement in this order; or if you'd rather split — e.g. ship Part 1 first, then planning workflow as a follow-up — that works too.