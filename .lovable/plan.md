## Async elder motions ("Send to vote")

Add a lightweight async voting tool inside the Elder Hub so full elders can put a motion to a vote without waiting for a meeting.

### Scope

- Eligible voters: **full elders only** (`role = 'elder'`). Candidates can view results read-only.
- Pass rule: **simple majority of votes cast (Yes vs No) at the deadline**. Abstain counted but excluded from majority math. Auto-closes at deadline; can be closed early by creator.
- Visibility: **attributed** — everyone sees who voted which way.
- Notifications: **email + in-app** on open and on close.

### UX

New tab in `/elder` nav: **Motions** (`/elder/motions`).

Two sections:
- **Open** — motions still accepting votes, with deadline countdown, current tally, and your vote (Yes / No / Abstain buttons + optional comment).
- **Closed** — outcome (Passed / Failed / Tied), final tally, who voted what, creator notes.

"New motion" button (full elders only) opens a dialog: title, description (rich text), deadline (date+time, default 72h).

Detail view per motion: full description, list of eligible voters with their vote + timestamp + comment, "Close early" button for creator/any full elder.

Elder Hub overview card: "X open motions awaiting your vote" linking into the tab.

### Data model (new tables)

- `elder_motions` — id, title, description, created_by, created_at, deadline_at, closed_at, closed_by, outcome (`passed` | `failed` | `tied` | `open`), tally cached on close.
- `elder_motion_votes` — id, motion_id, voter_id, choice (`yes` | `no` | `abstain`), comment, voted_at. Unique on (motion_id, voter_id) — vote is updatable until close.

RLS:
- SELECT: any elder access (elder or candidate).
- INSERT motion / close motion: `is_full_elder(auth.uid())`.
- INSERT/UPDATE vote: `is_full_elder(auth.uid())` AND motion is open AND `voter_id = auth.uid()`.
- No DELETE for votes (auditability).

### Server functions (`src/lib/elder-motions.functions.ts`)

- `listMotions({ status })` — open vs closed list with tallies.
- `getMotion({ id })` — motion + all votes with voter names.
- `createMotion({ title, description, deadline_at })` — inserts, enqueues open-email to all full elders, returns id.
- `castVote({ motion_id, choice, comment })` — upsert, guard against closed motions.
- `closeMotion({ id })` — sets outcome from tally, sends recap email.

All gated via `requireSupabaseAuth` + `assertFullElder` (reuse helper from `src/server/elder.server.ts`; add a candidate-allowed variant for read).

### Auto-close

Public cron route `src/routes/api/public/hooks/close-expired-motions.ts` guarded by `CRON_SHARED_SECRET`. Sweeps `elder_motions` where `closed_at is null and deadline_at < now()`, computes outcome, sends recap. Schedule via existing pg_cron pattern (every 15 min).

### Emails

Two templates via existing email queue:
- **Motion opened** — title, description, deadline, link to motion.
- **Motion closed** — outcome, final tally, link to detail.

Sent to all users with `role = 'elder'` (look up via `user_roles` join `profiles.email`).

### Files

New:
- `src/lib/elder-motions.functions.ts`
- `src/routes/elder.motions.tsx` (list + tab content)
- `src/routes/elder.motions.$motionId.tsx` (detail)
- `src/routes/api/public/hooks/close-expired-motions.ts`
- migration: tables, RLS, grants

Edit:
- `src/routes/elder.tsx` — add "Motions" tab
- `src/components/AppSidebar.tsx` — add Motions under Elder Hub
- `src/routes/elder.index.tsx` — add "open motions" card

### Out of scope (for now)

- Secret/anonymous ballots
- Quorum enforcement beyond simple majority of cast votes
- Amendments / threaded debate (use the description + comments on each vote)
- Integration into elder meeting agenda (we can add a "Convert to motion" action later)
