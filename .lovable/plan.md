
# Annual Plan + Annual Calendar Kickoff Automation

Extend the same cycle/hook/notification pattern used for the budget workflow to the two remaining annual tracks. Both open **May 1** and finalize **June 30** of each fiscal year, with a mid-May nudge to preserve time for feedback and approval.

## Timeline (shared by both tracks)

```text
May 1  ─ Auto: open cycle, seed a submission row per active ministry leader,
         email leaders + create dashboard tasks (draft due May 31)
May 15 ─ Nudge #1: leaders still in draft / not started
May 31 ─ Leader submission deadline (drafts flip to "submitted";
         late submissions flagged and core notified)
Jun 1–15 Core review window: core marks each submission "under_review",
         adds feedback in-app; leader is notified per submission to revise
Jun 16–25 Revision window: leaders address feedback and resubmit
Jun 20 ─ Nudge #2: any submission still awaiting revision or approval
Jun 30 ─ Auto: close cycle, mark any not-yet-approved items "late",
         email core with final outstanding list
```

Hook routes will accept a `?phase=` query param so a single daily cron entry can dispatch the right phase, and every hook is idempotent.

## Annual Plan (MAP) automation

Reuses existing `ministry_action_plans` + `ministry_high_level_plans`.

- New table **`ministry_plan_cycles`** (`fiscal_year`, `status` [setup / open / review / revision / complete], `opens_at`, `submissions_due_at`, `feedback_due_at`, `closes_at`, `created_by`). One row per FY.
- `createPlan` already hydrates from the most recent un-carried 10k-ft plan — the May 1 kickoff simply ensures each leader has an active MAP row for the new FY.
- Add `cycle_id` (nullable FK) + `fiscal_year` to `ministry_action_plans` so cycle progress is queryable. Backfill nulls; new rows get populated by the kickoff hook and by `createPlan` while a cycle is open.
- Kickoff hook creates one draft MAP per active `ministry_leader_assignments` row, tagging it with `cycle_id`.
- Statuses use the existing `draft → submitted → under_review → approved` flow, plus a new `revision_requested` value so the feedback loop is explicit. Cycle status auto-advances when all submissions are `approved` or on Jun 30.
- Admin page gains a "Plan cycle" panel alongside the existing budget-cycle admin.

## Annual Calendar automation

Reuses existing `calendar_planning_cycles` + `calendar_plan_submissions` + `calendar_proposed_events`. No new schema for the cycle itself.

- Kickoff hook: if no cycle exists for the new FY's `plan_year`, insert one with `status = 'open'`, `opens_at = May 1`, `closes_at = Jun 30`. Then for each active ministry leader, insert one draft `calendar_plan_submissions` row per relevant `sub_calendar`. Notify leaders + create dashboard tasks.
- Add a `revision_requested` submission status (mirrors the plan track) so core feedback + leader revision is a real state, not an ad-hoc note.
- May 15 nudge: email leaders with `status IN ('draft')`.
- May 31 hook: auto-flip drafts to `submitted` where the leader clicked "ready" or flag as `late`; notify core of the review queue.
- Jun 1–15 review window: existing per-submission review UX at `/calendar/planning/review` drives feedback + `revision_requested` transitions.
- Jun 20 nudge: submissions still in `revision_requested` or awaiting approval.
- Jun 30 finalize hook: cycle → `review`/`closed` per remaining state, email core with outstanding list.

## New hook routes (`src/routes/api/public/hooks/`)

```text
plan-cycle-may1.ts            Plan track kickoff        (May 1)
plan-cycle-nudge.ts           Plan track nudges         (May 15, Jun 20)
plan-cycle-submissions-due.ts Plan submission deadline  (May 31)
plan-cycle-jun30.ts           Plan track finalize       (Jun 30)
calendar-cycle-may1.ts        Calendar kickoff          (May 1)
calendar-cycle-nudge.ts       Calendar nudges           (May 15, Jun 20)
calendar-cycle-submissions-due.ts Calendar deadline     (May 31)
calendar-cycle-jun30.ts       Calendar finalize         (Jun 30)
```

All are `/api/public/*`, called by `pg_cron` with the anon `apikey` header. Each is idempotent — safe if pg_cron double-fires or if core kicks off manually from the admin UI.

## Emails (React Email templates)

Reusing the existing transactional queue and the budget templates' style:

- `plan-cycle-open`, `plan-cycle-nudge`, `plan-cycle-submissions-due` (core summary), `plan-cycle-feedback-ready` (leader), `plan-cycle-finalize` (core)
- `calendar-cycle-open`, `calendar-cycle-nudge`, `calendar-cycle-submissions-due`, `calendar-cycle-feedback-ready`, `calendar-cycle-finalize`
- Existing `notifyCycleOpen` / `notifySubmissionReady` continue to fire; new templates only cover the new automated transitions.

Dashboard tasks are created via the existing action-items surface with `source = 'annual_plan'` / `source = 'annual_calendar'` so they show on the home page.

## Admin UI

Extend the annual-planning admin surface to cover all three tracks (Budget / Plan / Calendar tabs). Core can:
- View current cycle status + phase per track
- Manually open / advance / close a cycle (off-schedule kickoff)
- See a leader × status grid
- Drop into the existing per-submission review pages for feedback

The existing `/ministry-plans/admin` and `/calendar/planning/review` pages keep their per-submission review UX; the admin page only manages cycle lifecycle.

## Overview page

Update `annual-planning.index.tsx` and its sibling tiles so each shows the current cycle's phase + a "Your submission" CTA when a leader has an open assignment.

## pg_cron

One-time SQL via `supabase--insert` after routes deploy:

```text
plan-cycle-may1                0 12 1 5 *
plan-cycle-nudge               0 13 15 5 *
plan-cycle-nudge (jun)         0 13 20 6 *
plan-cycle-submissions-due     0 12 31 5 *
plan-cycle-jun30               0 12 30 6 *
calendar-cycle-may1            0 12 1 5 *
calendar-cycle-nudge           0 13 15 5 *
calendar-cycle-nudge (jun)     0 13 20 6 *
calendar-cycle-submissions-due 0 12 31 5 *
calendar-cycle-jun30           0 12 30 6 *
```

## Security / access

- Hooks: anon `apikey` header only; no PII in responses; all writes via `supabaseAdmin` inside the handler.
- New `ministry_plan_cycles` table: RLS with leader-read (their own cycle rows via join) + core-write, plus GRANTs to `authenticated` + `service_role`.
- MAP schema change: adding nullable `cycle_id` + `fiscal_year` doesn't affect existing RLS. Adding `revision_requested` to the status enum only widens the allowed set.

## Out of scope

- Board/finance approval steps after core approval (can layer later).
- Auto-emailing every calendar-approval decision (existing per-submission notifications still fire).
- Rewriting the existing MAP or Calendar submission UIs — automation only wraps them.
