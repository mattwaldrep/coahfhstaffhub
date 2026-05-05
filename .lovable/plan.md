## Goal

When an elder meeting is generated, the next meeting's "Last Meeting Follow-up" section should automatically include:
1. Every item from the previous meeting's **New Business** section.
2. Any other agenda item (from any section) that an elder explicitly **flagged** to carry over.

## How it works today

- `createElderMeeting` already seeds the new meeting's agenda from two sources: open `elder_action_items` (inserted into `follow_up` as `source: "carryover"`) and rows in `elder_next_meeting_seed`.
- It does **not** look at the previous meeting's agenda items at all, so New Business never carries forward.
- There is no UI control to mark an arbitrary agenda item for follow-up.

## Plan

### 1. Schema change

Add one column to `elder_agenda_items`:
- `carry_to_next boolean not null default false`

No new tables — we reuse the agenda items themselves as the source of truth, which keeps RLS, executive-session, and ordering behavior consistent.

### 2. Server: carry forward into next meeting

Update `createElderMeeting` in `src/server/elder.functions.ts`:
- Find the most recent prior `elder_meetings` row (by `meeting_date`, excluding the one being created).
- Load its `elder_agenda_items` where `section_key = 'new_business'` OR `carry_to_next = true`.
- Insert them into the new meeting as `section_key: 'follow_up'`, `source: 'carryover'`, preserving `title`, `body`, `executive_session`, and ordering after any existing follow-up inserts.
- Dedupe against the existing action-item carryover (skip if a follow-up row with the same title already exists for the new meeting).
- Respect executive-session visibility — non-full elders never see executive items, but the server uses the admin client so they will be inserted; that matches how action-item carryover already behaves.

### 3. Server: small helpers

Add a server function `setAgendaCarryToNext({ id, carry })` that updates the flag (gated by `assertElderAccess` + executive-session rule, mirroring `setAgendaExecutive`).

### 4. UI: flag any agenda item

In `src/routes/elder.meetings.$meetingId.tsx` → `AgendaItemRow`:
- Add a bookmark/flag icon button next to the executive lock icon.
- Filled state when `carry_to_next === true` (or when `section_key === 'new_business'`, shown as implicit/auto-on and disabled with a tooltip "New Business always carries forward").
- Clicking toggles `setAgendaCarryToNext`.
- Add a small "Will carry to next meeting" hint under the title when flagged.

No changes to JointSections for now (joint meetings have their own subsection items, not standard agenda items). If you want the same behavior there, say so and I'll extend it.

### 5. Notes / non-goals

- No backfill: only meetings created **after** this change will get auto-carry. Existing follow-up items from the seed table and action-item carryover continue to work unchanged.
- The existing `elder_next_meeting_seed` table stays as-is for ad-hoc "add directly to next meeting" flows from outside a meeting view.

## Files touched

- migration: add `carry_to_next` to `elder_agenda_items`
- `src/server/elder.functions.ts` — extend `createElderMeeting`, add `setAgendaCarryToNext`
- `src/routes/elder.meetings.$meetingId.tsx` — flag button + hint in `AgendaItemRow`
