
## 1. Restructure "This Sunday's Slot" UI

Replace the current free-form list in `src/components/meeting/MeetingSections.tsx` (`ThisSundaySection`) with **3 fixed labeled rows**:

- Ministry Highlight
- Announcement 1
- Announcement 2

Each row behaves the same:
- Shows the current pick (event link or text) or "Not chosen yet"
- Inline Edit lets you choose **Text** or **Event** (same picker we have today)
- Saving a row **replaces** any existing row for that slot — never two per slot
- An "X" clears the slot

Below the 3 rows: a status line like `2 of 3 slots filled` and the Push to PCO button (see §3).

### Data model

Re-use the existing `event_sunday_slots` table. Change `channel` semantics to one of: `ministry_highlight`, `announcement_1`, `announcement_2`. Save logic becomes "upsert by `(sunday_date, channel)`" — delete any existing row for that channel before inserting, so each slot is single-pick.

No migration required; old rows with `sunday_announcement` get a one-time backfill via a migration that maps them in order to `announcement_1`, `announcement_2` (extras dropped, oldest two kept).

## 2. Settings: PCO Service Type

Add a small section to `src/routes/settings.tsx` (core role only) with one field:

- **PCO Sunday Service Type ID** — stored in a new `app_settings` row (single-row config table) or reuse `elder_pco_config` pattern with a new table `pco_services_config(id, sunday_service_type_id, updated_at)`.

A "Test connection" button calls a server fn that fetches `/services/v2/service_types/{id}` and shows the name — confirms credentials + ID are good before anyone tries to push.

## 3. Push to PCO button

New server fn `pushSundaySlotsToPco({ sundayIso })` in `src/lib/pco-services.functions.ts`:

1. Auth-gate with `requireSupabaseAuth` + core/meeting role check.
2. Read the 3 rows from `event_sunday_slots` for `sundayIso`. Resolve event titles to text so each slot becomes a single string.
3. Call PCO Services API:
   - `GET /services/v2/service_types/{id}/plans?filter=future&per_page=25` → pick the plan whose `sort_date` matches `sundayIso` (fail clearly if none found).
   - `GET /services/v2/service_types/{id}/plans/{planId}/items?per_page=100` → find the 3 items by exact title match: "Ministry Highlight", "Announcement 1", "Announcement 2" (case-insensitive, trimmed).
   - For each matched item, `PATCH /services/v2/service_types/{id}/plans/{planId}/items/{itemId}` with `data.attributes.description = <slot content>`.
4. Return a per-slot result: `{ slot, status: "updated" | "missing_item" | "empty" }`. Empty slots are skipped (not blanked out — safer default).

The button shows a toast summary ("Updated 3 of 3 items") and lists any items it couldn't find by title (so they can rename in the template).

### PCO client

Extend `src/server/pco.server.ts` with a `pcoServicesFetch` helper that reuses the existing `PCO_APP_ID` / `PCO_SECRET` basic auth but targets `https://api.planningcenteronline.com/services/v2`. Same error envelope. No new secrets needed — but the existing PCO Personal Access Token must have **Services** product access enabled in PCO; the Test button surfaces a clear error if not.

## 4. Out of scope (deferred)

- Auto-sync on edit (we chose manual push).
- Writing to plan items other than the 3 named ones.
- Multi-service-type support (one Sunday service type for now).
- Pulling existing PCO descriptions back into the meeting view.

## Technical details

- Files changed:
  - `src/components/meeting/MeetingSections.tsx` — rewrite `ThisSundaySection` to 3 fixed rows + Push button.
  - `src/lib/pco-services.functions.ts` — new server fns: `pingPcoServices`, `pushSundaySlotsToPco`.
  - `src/server/pco.server.ts` — add `pcoServicesFetch`, plan lookup, item lookup/patch helpers.
  - `src/routes/settings.tsx` — add PCO Services config section (core only).
  - Migration: create `pco_services_config` table + grants + RLS (core read/write only); backfill `event_sunday_slots` channel values.
- PCO item title matching is exact (case-insensitive, trim). If the template item is renamed, we report `missing_item` instead of guessing.
- Push is idempotent — running it twice produces the same result.
- All PCO calls go through server fns; no PCO creds ever reach the browser.
