## Goal

Allow events to opt out of the "needs a room" and "needs a leader" readiness checks independently, for things like holidays, observances, and FYI items.

## Schema (one migration)

Add two boolean flags to `calendar_events`:

- `room_not_needed boolean NOT NULL DEFAULT false`
- `leader_not_needed boolean NOT NULL DEFAULT false`

(Mirror columns on `calendar_proposed_events` so planning submissions can carry the same intent through approval.)

## Readiness scoring (`src/lib/event-readiness.ts`)

Extend `ReadinessEvent` with `room_not_needed?: boolean` and `leader_not_needed?: boolean`.

For **general** events:
- If `leader_not_needed`: award the 40 leader points, drop "Leader" from missing.
- If `room_not_needed`: award the 30 room points, drop "Room" from missing.
- Checklist scoring unchanged.

For **class** events (`category === "Class"`):
- If `leader_not_needed`: award the 50 teacher points and drop "Teacher". (Rare for classes, but consistent.)
- If `room_not_needed`: award the 25 room points and drop "Room".
- Childcare unchanged.

Net effect: a holiday with both flags set scores 100% with no warnings.

## UI

**Event dialog (`src/routes/calendar.tsx`) — Logistics section**
- Under the Rooms picker, add a small checkbox: "No room needed (skip readiness check)". When checked, visually dim/disable the Rooms picker.
- Under the Leader picker, add a small checkbox: "No leader needed". When checked, dim/disable the leader field.
- Wire both into `form` state, send on save, and feed into the in-dialog readiness preview via `has_room` / leader inputs.

**Calendar `readinessFor(occ)` helper**
- Pass the two new flags through alongside the existing room/leader resolution.
- Update prefetch/load mapping so list view, month chips, and dialog all see the flags.

**Class series dialog (`src/routes/calendar_.classes.tsx`)**
- Same two checkboxes, persisted to the linked `calendar_event_id` so generated occurrences inherit them.

**Planning submission form**
- Add the two checkboxes to the proposed-event editor so submitters can mark a holiday up front; reviewer approval carries them onto `calendar_events`.

## Out of scope

- A separate "Holiday/Observance" category — kept simple; categories stay free-form.
- Changing the room or leader pickers themselves (no "N/A" pseudo-row needed).
- Hiding the readiness badge entirely for fully-skipped events (it will just show 100%, which reads correctly).