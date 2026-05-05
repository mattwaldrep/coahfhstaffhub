## Goal

Make Pastoral Care driven by Planning Center Online (PCO) People. PCO is the source of truth for *who* is on the care list and their custom-field metadata (assigned elder, spiritual health). This app owns the **notes/updates thread** for each person. The meeting's Pastoral Care section becomes the same live list, where notes posted during a meeting are auto-tagged with that meeting.

---

## 1. PCO integration (server side)

**Auth:** single Personal Access Token. PCO PATs are an `app_id : secret` pair used as HTTP Basic auth — we'll store both as secrets (`PCO_APP_ID`, `PCO_SECRET`) and request them with the `add_secret` tool. You generate the PAT at api.planningcenteronline.com → Personal Access Tokens.

**Config we need from you (in `/elder/settings`):**
- PCO **List ID** for the elder care list
- PCO **field definition IDs** for: "Assigned Elder" and "Spiritual Health Status"

We'll add a small Settings card where a full elder pastes those three IDs. They're stored in a new `elder_pco_config` row (single-row table).

**New server module** `src/server/pco.server.ts` — thin wrapper around `https://api.planningcenteronline.com/people/v2`, using Basic auth from env. Functions:
- `fetchCareList()` → people on the configured list, including `field_data` for the two configured fields
- `updateFieldDatum(personId, fieldDefinitionId, value)` → write back spiritual health status

Wrapped by `src/server/pco.functions.ts` (`createServerFn` + `requireSupabaseAuth`, gated to elder access). Server caches list response in-memory for ~60s to keep PCO API calls cheap.

---

## 2. Database changes

Wipe existing pastoral-care entries (per your decision) and re-key around PCO IDs.

- New table `pco_pastoral_notes`:
  - `pco_person_id` (text, indexed)
  - `body`, `author_id`, `executive_session`, `meeting_id` (nullable — set when posted from a meeting), `created_at`
  - RLS: any elder access can read; full-elder-only when `executive_session=true`
- New table `elder_pco_config` (single row): `list_id`, `assigned_elder_field_id`, `spiritual_health_field_id`, `updated_by`, `updated_at`. Full-elder modify, elder-access read.
- Drop `pastoral_care_entries` and `pastoral_care_updates` (and the `pastoral` block in elder server functions).
- Remove the "Pastoral Care" `section_key` from the standard meeting sections list (it becomes its own dedicated component, not a generic agenda section).

---

## 3. Pastoral Care page (`/elder/pastoral-care`)

Replaces today's UI:

- Header: "Pastoral Care" + small "Synced from PCO" badge + Refresh button
- Filter chips: All · My people · By spiritual health status
- Search box
- List of cards (one per PCO person): name, assigned elder, spiritual health status badge, count of recent notes
- Click a card → expanded panel:
  - Read-only PCO fields up top
  - **Spiritual health status dropdown** — editable inline; writes back to PCO via `updateFieldDatum`
  - Notes thread (newest first) — same UX as today's pastoral updates: textarea + Post, with optional "Exec" toggle for full elders
  - Notes show author + timestamp + (if applicable) "from {meeting date}" link

If `elder_pco_config` is empty, show an empty state pointing to Settings.

---

## 4. Meeting integration

In `elder.meetings.$meetingId.tsx`:

- Remove the generic "Pastoral Care" section from `STANDARD_SECTIONS`
- Insert a new dedicated `<MeetingPastoralCare meetingId={...} />` component in its place
- That component renders the same PCO-driven list as the page, but each "Post" call passes `meeting_id` so the note is tagged
- Realtime: subscribe to `pco_pastoral_notes` so notes added by another elder appear live

This means whatever the elders type during the meeting becomes part of the long-term thread automatically — no double entry.

---

## 5. Settings additions (`/elder/settings`)

New "Planning Center" card (full elders only):
- Status indicator: Connected / Not configured (calls a tiny `pcoPing` server fn)
- Inputs for List ID, Assigned Elder field ID, Spiritual Health field ID
- Help text explaining where to find each in PCO

Setup of the PAT itself (`PCO_APP_ID`, `PCO_SECRET`) happens once via the secret prompt.

---

## 6. Briefing / recap emails

Update the elder briefing + recap emails to include a "Pastoral Care updates since last meeting" section, pulled from `pco_pastoral_notes` (filtering exec content for the candidate version, as today).

---

## Technical notes

- PCO API: `GET /people/v2/lists/{list_id}/people?include=field_data&per_page=100` then page via `links.next`. Field values come back as `field_data` records referencing `field_definition` IDs.
- Status writes: `PATCH /people/v2/field_data/{id}` (update) or `POST /people/v2/people/{id}/field_data` (create) — wrapper handles both.
- All PCO calls go through `createServerFn` — never from the browser (Basic auth secret stays server-side, no CORS surprises).
- 60s in-memory cache + manual Refresh button keeps PCO rate-limit happy without feeling stale.
- Keep `executive_session` semantics consistent everywhere (RLS + UI lock icon).

---

## Open follow-ups (can defer)

- Whether to also surface PCO **household** info on the card (helpful pastoral context)
- Whether elders should be able to *add/remove* people from the PCO list from within this app, or that stays a PCO-only action

Let me know and I'll implement.