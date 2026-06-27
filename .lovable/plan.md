## Goal

Replace the bare `sms:` link on each pastoral care card with an in-app texting flow that:

1. Lets the elder compose a message inside a dialog (not in the phone keyboard).
2. Hands the finished message off to the elder's native SMS app — so the text leaves their personal number, preserving per-elder identity at zero cost.
3. Auto-logs the outgoing message as a `text` touchpoint with `direction: 'outbound'` the moment the handoff happens.
4. Surfaces an **"Awaiting reply"** pill on the card whenever the most recent text touchpoint is outbound, with a one-tap **Log reply** button so the elder can capture the response whenever they come back to the app (could be hours or days later).
5. Renders the full back-and-forth as chat bubbles inline on the card, visible to all elders + elder candidates.

## Why structured replies instead of generic comments

- **Conversation pairing:** outbound + inbound `text` touchpoints render as paired chat bubbles. A comment thread loses that structure.
- **Counts toward pastoral contact:** the 45/60-day gap tracker already reads from `pco_touchpoints`. Logging the reply as a touchpoint means the contact registers; logging as a comment would not.
- **Enables the "awaiting reply" state:** the app can detect that the last `text` touchpoint is outbound and prompt the elder to log when they're back. That signal only exists if replies have a distinct type/direction.

## What the user will see

**Compose dialog** (replaces the current Text button):

```text
┌─ Text Jane Doe ────────────────────────────┐
│ Phone: (555) 123-4567                      │
│ Templates: [Checking in] [Praying] [Visit] │
│ ┌────────────────────────────────────────┐ │
│ │ Hi Jane, just wanted to check in...    │ │
│ └────────────────────────────────────────┘ │
│ 142 chars                                  │
│            [Cancel]  [Open in Messages →]  │
└────────────────────────────────────────────┘
```

Tapping **Open in Messages** does two things in the same click:
- Saves an outbound `text` touchpoint (note = full body).
- Triggers an `sms:` URL with the body pre-filled (iMessage / Android Messages opens).

**On the card, after sending — "Awaiting reply" state:**

```text
⏳ Awaiting reply from Jane · sent 2h ago by Mark
   "Hi Jane, just wanted to check in..."
                                    [+ Log reply]
```

This pill stays visible until either (a) an inbound `text` touchpoint is logged for that person, or (b) the elder dismisses it. It's the entry point the elder hits when they reopen the app later.

**Log reply dialog** (one field):

```text
┌─ Log Jane's reply ─────────────────────────┐
│ ┌────────────────────────────────────────┐ │
│ │ Thanks for checking in, I'm doing      │ │
│ │ better this week.                      │ │
│ └────────────────────────────────────────┘ │
│ Received: [Now ▾]   (or pick date/time)   │
│                        [Cancel]  [Save]    │
└────────────────────────────────────────────┘
```

Saved as an inbound `text` touchpoint. The pill disappears; the bubble appears in the thread.

**Thread view** on each card: consecutive `text` touchpoints group into chat bubbles — outbound right-aligned with the elder's name, inbound left-aligned with the person's name and the elder who logged it shown as a small footnote ("logged by Mark, 9:14 PM").

## Visibility

Thread + reply logging visible to all elders and elder candidates (matches existing pastoral care list audience). No role gating changes — `pco_touchpoints` policies already cover this.

## Technical details

**Schema change:**

```sql
ALTER TABLE public.pco_touchpoints
  ADD COLUMN direction text
  CHECK (direction IN ('outbound', 'inbound') OR direction IS NULL);
```

Default `NULL` preserves history (older non-text or pre-feature touchpoints stay unaffected). No RLS change needed.

**Server functions** (`src/lib/pastoral-care.functions.ts`):

- Extend `logTouchpoint` validator with optional `direction: 'outbound' | 'inbound'` and an optional `created_at` override (used by Log reply when the elder picks "when did Jane actually reply?").
- No new endpoint needed; reply logging reuses `logTouchpoint`.

**Awaiting-reply detection:** pure client logic — for each person, find the most recent `text` touchpoint; if it's `direction = 'outbound'`, show the pill. No new DB column or query.

**Templates:** 3–4 starter phrases hardcoded on the client for v1. Promote to a DB table later if needed (flagged as a follow-up, not in this plan).

**`sms:` handoff:** reuse the existing platform-aware encode (`?&body=` on iOS, `?body=` on Android).

**Safety:** outbound log fires *before* the `sms:` handoff so the record exists even if the elder cancels in Messages. A 5-second Undo toast (via the existing `useUndoableAction` hook) lets them retract an accidental composer-then-cancel.

**Disabled state:** if `person.phone` is missing, Text button stays disabled with the current "No phone on file" tooltip.

## File summary

```text
NEW:  src/components/pastoral/TextComposerDialog.tsx
NEW:  src/components/pastoral/LogReplyDialog.tsx
NEW:  src/components/pastoral/TextThread.tsx       (chat-bubble renderer)
NEW:  src/components/pastoral/AwaitingReplyPill.tsx
EDIT: src/components/pastoral/PastoralCareList.tsx (swap Text button, render pill + thread)
EDIT: src/lib/pastoral-care.functions.ts           (extend logTouchpoint with direction + created_at)
MIGRATION: add pco_touchpoints.direction column
```

## Out of scope

- True automatic inbound capture (would require a paid provider like Twilio).
- DB-backed editable templates.
- MMS / image attachments.
- Read receipts / delivery status.
