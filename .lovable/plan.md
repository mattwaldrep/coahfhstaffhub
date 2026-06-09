## Goal

Replace the two "open in PCO" link-only sections with live submission lists. Each row shows the submitter and **all** form field answers, for submissions created since the previous staff meeting.

## Backend

**`src/server/pco-forms.server.ts`** (new)
- `listFormSubmissions(formId, sinceIso)` — calls PCO People API:
  - `GET /people/v2/forms/{formId}/form_submissions?where[created_at][gte]=…&include=person,form_submission_values.form_field&order=-created_at&per_page=100`
  - Walks pagination, returns `{ id, created_at, person: { id, name } | null, fields: [{ label, value, sequence }] }[]`
  - Reuses the existing `PCO_APP_ID` / `PCO_SECRET` basic auth via a small `pcoFetch` helper (same pattern as `pco.server.ts` / `pco-services.server.ts`).
  - Resolves field labels from the included `FormField` resource and concatenates multi-value answers (checkbox lists) into a single string.

**`src/lib/pco-forms.functions.ts`** (new)
- `listFirstStepSubmissions` and `listNextStepSubmissions` server fns, both `requireSupabaseAuth` + meeting/core role check (mirrors `assertMeetingRole` in `meeting.functions.ts`).
- Input: `{ meetingId: uuid }`. Handler:
  1. Loads the current meeting's `meeting_date`.
  2. Finds the previous completed meeting (`status='completed'`, `meeting_date < current`, order desc, limit 1). If none, falls back to 7 days before current.
  3. Calls `listFormSubmissions(FORM_ID, sinceIso)` with the hard-coded form IDs already in `meeting.tsx` (`161115` and `433638`).
  4. Returns `{ submissions, since, formUrl }`.

External-service failure handling: on PCO error, return `{ submissions: [], since, formUrl, error: string }` so the UI can show a fallback instead of blanking the section.

## Frontend

**`src/components/meeting/PcoFormSection.tsx`** (new)
- Props: `{ meetingId, sectionKey, title, subtitle, formUrl, fetcher }` where `fetcher` is one of the two server fns.
- Uses `useServerFn` + `useQuery` keyed on `[sectionKey, meetingId]`.
- Renders inside the existing `StandingSection` (collapsed by default) with:
  - Header line: "N submissions since {previous meeting date}" + "Open form in PCO" outline button.
  - List of cards, each card:
    - Submitter name (or "Anonymous") + submitted timestamp.
    - All fields rendered as `label: value` rows (always expanded, per user choice).
    - "Open submission" link to `https://people.planningcenteronline.com/forms/{formId}/responses/{submissionId}`.
  - Loading skeleton, empty state ("No new submissions since last meeting"), and error state (shows message + keeps the PCO link).
- Keeps the existing `NotesField` at the bottom so meeting notes still persist.

**`src/routes/meeting.tsx`**
- Swap the two `LinkSection` blocks (`first-step-cards`, `next-step-cards`) for `PcoFormSection` instances, passing the matching fetcher and form URL. No other section changes.

## Technical Notes

- Form IDs stay in the route file (already there): `161115` First Step, `433638` Next Step.
- PCO People API field-data shape: each `FormSubmissionValue` has `attributes.display_value` (preferred) plus a `form_field` relationship; we sort by the field's `sequence` attribute so output matches the form's question order.
- Pagination: PCO returns `links.next`; cap at ~5 pages (500 submissions) defensively — a weekly window will never approach that.
- All PCO calls stay server-side; `PCO_APP_ID` / `PCO_SECRET` are already configured.
- No database/schema changes. No new secrets. No changes to role gating beyond reusing `meeting`/`core`.
