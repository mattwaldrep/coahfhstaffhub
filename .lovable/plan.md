## How notifications work today

When you open a planning cycle, the app automatically emails **every user in the database who has a role of `core`, `meeting`, or `extended`** (deduped by email). There's no separate "planning recipients" list — the audience is simply everyone you've invited into the app.

Right now you have 6 users (you, Steven, plus four elders) — all also leaders, but if any sub-calendar leader isn't in this list, they won't get the email.

## What you need to do

For each ministry leader who should plan a sub-calendar, **invite them through Settings → Users** with the **Extended** role. That single action:

1. Creates their account + profile (via the existing invite flow in `inviteUser`).
2. Sends them a Lovable Cloud invite email so they can set a password.
3. Adds them to the recipient list for the next `notifyCycleOpen` email.
4. Lets them sign in, see the "Annual Planning" sidebar item, and submit their own sub-calendar plan.
5. Lets them view other ministries' submitted plans (read-only) to avoid conflicts.

Extended is the right tier — they can plan and read, but can't approve submissions or manage cycles (that stays with Core).

## Suggested leader roster to invite

Based on the sub-calendars defined in the planner (Forest Hills Main, COAH:LM, Youth, General), at minimum invite the leader for each. Add anyone else who runs recurring events that land on the master calendar.

## Workflow going forward

```text
1. Add new leader → /users → Invite (role: Extended)
2. Leader receives Lovable Cloud invite, sets password, logs in
3. When you open the next cycle:
   - Cycle insert fires notifyCycleOpen
   - Every core/meeting/extended user (incl. new leader) gets the email
   - Leader clicks CTA → /calendar/planning → starts their plan
4. On submit, Core (you + Steven) get a "ready for review" email
```

## Optional polish (only if you want it later)

- **Pre-cycle dry-run check**: a small "Preview recipients" button on the New Cycle dialog that lists who will get the email, so you can confirm coverage before clicking Open.
- **Per-sub-calendar owner mapping**: instead of relying on "all extended users get notified," maintain an explicit `sub_calendar → leader_id` table and only email the assigned leader for each sub-calendar. Useful once the leader list grows past ~10 people.
- **Reminder nudge**: a scheduled job that re-emails leaders who haven't started a draft 3 days before `closes_at`.

None of these are required — the simple "invite as Extended" flow above is sufficient for the cycle-open notification to work.

## What I'd build if you say go

Nothing yet — this is a workflow/data question, not a code change. The system already does what you need; you just need to populate the user list. If you want any of the optional polish items, tell me which and I'll plan that next.
