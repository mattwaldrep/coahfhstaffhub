## Goal

Make opening a mission trip feel like walking through a **process**, not scrolling a long form. Each of the 12 booking-and-deployment steps becomes a discrete, navigable stage with just the tools that step needs, an explicit Complete / Skip / Reset state, and a clear sense of where you are in the journey.

## New trip detail layout

Replace the current top-to-bottom scroll dialog with a two-pane workspace inside the same Dialog (wider — `max-w-5xl`):

```text
┌──────────────────────────────────────────────────────────────┐
│  Grace Church  ·  Aug 4–9  ·  Team #14        Readiness 67%  │  ← sticky header
│  Status: Pre-Trip ▾                          [Trip basics ▾] │     (basics collapse into a popover)
├────────────────┬─────────────────────────────────────────────┤
│ PHASE: INTAKE  │  Step 2 of 12 — Welcome email               │
│  ✓ Confirmation│  ────────────────────────────────────────── │
│  ● Welcome ema.│  Send the inquiry form + welcome message    │
│  ○ Questionn…  │  to the team leader.                        │
│                │                                             │
│ PLANNING       │  [ Compose welcome email ]                  │
│  ○ Planning ca.│  [ Copy inquiry link ]                      │
│                │                                             │
│ ITINERARY      │  Notes for this step …………………………………… │
│  ⊘ Draft sched.│                                             │
│  ○ Confirm sch.│                                             │
│  ○ Supplies    │  ─────────────────────────────────────────  │
│  ○ Final sched.│  [ ← Previous ]  [ Skip step ▾ ][ Mark done →]│
│                │                                             │
│ IN FIELD …     │                                             │
│ WRAP-UP …      │                                             │
└────────────────┴─────────────────────────────────────────────┘
```

- **Left rail**: the 12 steps grouped under 5 phase headings (Intake, Planning, Itinerary, In Field, Wrap-up). Each row shows an icon for its state (`✓` done, `●` active, `⊘` skipped, `○` pending) and is clickable to jump.
- **Right pane**: one step at a time. Shows the step name, a 1-line description of what this step is, then ONLY the tool(s) and fields relevant to that step (welcome-email composer, planning-call panel, draft-itinerary panel + doc sync, pre-trip confirm checklist, final-schedule send, etc.). Other tools stay hidden.
- **Footer in the right pane**: `Previous` · `Skip step ▾` · `Mark done →`. The skip button opens a small popover with an optional reason ("not needed because…"). Marking done auto-advances to the next non-skipped step. Already-done/skipped steps show `Reset` instead.
- **Header**: trip name, dates, status pill, readiness %. A `Trip basics ▾` popover holds the church/dates/leader/status form so it's one click away but out of the flow. Save persists on blur.

## Skip behaviour

- New field on each trip: `skipped_steps: Record<string, boolean>` (mirrors the existing `steps` shape).
- Readiness % = `(done + skipped) / total` so a skipped step no longer blocks the bar from reaching 100%.
- Skipped steps render with a strikethrough + `Skipped` tag in the rail and on the kanban card tooltip. Status filter chips and "missing items" tooltips treat skipped as resolved.
- Skipping is reversible — `Reset step` clears both done and skipped flags.

## Phase → step grouping

| Phase | Steps |
| --- | --- |
| Intake | Confirmation, Welcome email, Questionnaire received |
| Planning | Planning call |
| Itinerary | Draft schedule, Confirm schedule & staff leads, Place supplies orders, Send final schedule |
| In Field | Orientation session, Daily leader check-in |
| Wrap-up | Thank-you & feedback, Debrief call |

Each phase header in the rail shows `done/total` for that phase.

## Step → tool mapping

| Step | Right-pane content |
| --- | --- |
| Confirmation | `InquiryPanel` (inquiry token, link, copy) |
| Welcome email | "Compose welcome email" button + leader email field + inline note |
| Questionnaire received | Inquiry submission summary (read-only) + planning-call scheduler shortcut |
| Planning call | `PlanningCallPanel` (date/time, planning notes sections) |
| Draft schedule | `DraftItineraryPanel` body editor + "Sync to Google Doc" + "Email draft" |
| Confirm schedule & staff leads | `PreTripConfirmPanel` (the 3-item confirm checklist + coordinator on-call) |
| Place supplies orders | Inline supplies notes (uses existing planning_notes.supplies) + outreach tracks |
| Send final schedule | Doc URL + "Send final schedule" Gmail composer |
| Orientation session | Notes + "Set on-call coordinator" reminder |
| Daily leader check-in | Daily window times + simple per-day check-in log |
| Thank-you & feedback | "Compose thank-you" email + feedback URL field |
| Debrief call | Date + free-form notes |

Per-step `notes` field stored under a new `step_notes: Record<string, string>` column (or reuse `planning_notes` keyed by step key) so coordinators can leave context without dumping it into the generic `notes` field.

## Card cleanup (Kanban)

Tighten the existing `TripCard` while we're here so the new flow has a clean entry point:
- Top row: church name + status pill + readiness score badge.
- Middle row: date range + leader name on one line.
- Bottom row: phase progress dots (5 small pills, one per phase, filled proportional to done+skipped in that phase) instead of a single thin bar. Hover shows "Intake 2/3 · Planning 1/1 · …".
- Quick actions (mail / phone / link / status select) stay in a single row at the bottom.

## Technical notes

- **Schema migration**: add `skipped_steps jsonb not null default '{}'::jsonb` and `step_notes jsonb not null default '{}'::jsonb` to `public.mission_trips`. Backfill is no-op.
- **State**: keep `form` shape but add `skipped_steps` and `step_notes`. Persist via the existing edit pathway.
- **Refactor**: extract a `TripStepper` component (`src/components/missions/TripStepper.tsx`) that owns left-rail + right-pane + footer. Existing panel components (`InquiryPanel`, `PlanningCallPanel`, `DraftItineraryPanel`, `PreTripConfirmPanel`) get rendered by the stepper based on the active step key — they keep their internal logic untouched.
- **Readiness scoring**: update `scoreTrip` / `readinessPct` to treat `skipped_steps[k] === true` as satisfied for the steps-derived portion, so kanban badges and the "missing items" tooltip match the new behavior.
- **No design-system drift**: reuse existing tokens, shadcn `Tabs`-style rail styling, and `Checkbox`/`Button` primitives. No new colors.

## Out of scope

- Reordering or renaming the 12 steps.
- Changing how trips move between Kanban columns.
- Server-side automation triggered by completing steps (e.g. auto-send emails on mark-done) — buttons remain manual.