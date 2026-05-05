# Plan: 7 Feature Upgrades

Tackling items 1, 4, 5, 6, 8, 10, 11 from the previous list. Sequenced by dependency and shared infrastructure.

## 1. Google Tasks integration (item 1)

Replace the placeholder "Push to Google Tasks" toast with a real per-user OAuth flow.

- Add a Google connector via the standard Google connector (Tasks scope: `https://www.googleapis.com/auth/tasks`).
- Each staff member links their own Google account from **Settings → Integrations** (new section).
- Store the per-user refresh token in a new `user_integrations` table (user_id, provider, refresh_token, access_token, expires_at). RLS: user can only see/manage their own row.
- New server function `pushActionItemToGoogleTasks({ actionItemId })`:
  - Looks up the assignee's stored token, refreshes if needed, POSTs to `tasks/v1/lists/@default/tasks` with title + due_date + notes.
  - Marks `action_items.google_task_id` (new column) so we don't double-push.
- "Push to Google Tasks" button on each action item calls the server function. Disabled if assignee hasn't linked their account; tooltip explains.

## 2. Meeting recap email (item 5)

After a meeting is finalized, send a branded summary email to all staff.

- Add a "Finalize meeting" button on `/meeting` (top right, next to "Save"). Sets `status='completed'`, `completed_at=now()`.
- On finalize, call new server function `sendMeetingRecap({ meetingId })`:
  - Gathers: agenda items, all section notes, event notes, new action items (created during this meeting), Sunday review snapshot.
  - Renders a React Email template (`MeetingRecap`) and enqueues to all `core` + `meeting` role users.
- Requires email infrastructure setup (auth/transactional). I'll trigger the email-domain setup dialog if no domain exists yet, then scaffold transactional templates.
- Add a "Resend recap" button visible after finalization.

## 3. Overdue action item surfacing (item 6)

- Add an "Action Items" widget to the home dashboard (`/`) showing:
  - **My open items** (assignee = current user)
  - **Overdue across team** (visible to core only)
- Color-coded: red if past due, amber if due within 3 days.
- Optional weekly digest email (Monday 8am via pg_cron → server route → reuse transactional email infra). Sends each user their open + overdue items.

## 4. Sunday Review submission nudge (item 8)

- pg_cron job every Monday at 7am calls `/api/public/hooks/sunday-review-nudge`.
- Endpoint checks if a `sunday_reviews` row exists for the prior Sunday. If not, emails all `core` + `meeting` users a short reminder with a link to `/sunday-review`.
- Verifies a shared secret header to prevent abuse.

## 5. Missions workflow polish (item 10)

- Confirm `mission_trips.steps` JSON is being rendered as a checklist UI on the missions detail/expanded card. If only stored as raw JSON, build a proper editable step-list with progress bar.
- Add "itinerary upload" (file → `mission-trips` storage bucket, new) replacing the current text-only `itinerary_link` (keep the link as a fallback).
- Add status filter chips on `/missions` (not_started / planning / confirmed / completed).

## 6. Calendar single-occurrence editing (item 11)

The `calendar_events.excluded_dates` column already exists. Wire it up properly:

- When editing a recurring event in `/calendar`, show a dialog: **Edit this occurrence** vs **Edit all**.
- "Edit this occurrence" → adds the date to `excluded_dates` on the original event AND inserts a new one-off event with the modifications.
- "Delete this occurrence" → adds to `excluded_dates` only.
- Update the recurrence expansion helper (`src/lib/calendar-expand.ts`) to skip dates listed in `excluded_dates` (it likely already does; verify).

## 7. Finance budget vs actuals variance (item 4 — not on your list but tightly tied to #6/#10... actually you said skip 4. Removing.)

*(Reread your message — you DID include 4. Keeping it.)*

Item 4 was **PCO First/Next Step Cards integration**. Build a small "PCO snapshot" panel inside those meeting sections:

- Add a `PCO_API_TOKEN` secret (Personal Access Token from PCO).
- Server function `getPcoFormCounts({ formId })` hits `https://api.planningcenteronline.com/people/v2/forms/{id}/form_submissions?per_page=1` and returns total count + last 7 days count.
- Show "X total submissions • Y this week" inside the First Step / Next Step cards with a refresh button.

## Sequencing

I'll work in this order and check in after each major chunk:

1. **Email infrastructure** (prerequisite for #2, #3-digest, #4) — domain setup dialog + transactional scaffolding
2. **Google Tasks** (#1) — connector + token storage + push function
3. **Meeting recap email** (#2) — finalize flow + recap template
4. **Overdue action items dashboard widget + weekly digest** (#3)
5. **Sunday review nudge cron** (#4)
6. **PCO integration** (item 4 from your list)
7. **Missions polish** (#5)
8. **Calendar single-occurrence editing** (#6)

## Confirmations needed before I start

- **Google Tasks**: OK to add a "Settings → Integrations" page where each staff member links their own Google account?
- **Email domain**: do you already have a domain you want emails sent from (e.g. `notify@yourchurch.org`)? If not I'll trigger the setup dialog.
- **PCO**: do you have a PCO Personal Access Token, or should I ask for it when we get to that step?
- **Weekly digest**: send Monday 8am, or different time?
