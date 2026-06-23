Ship four staff/elder productivity boosts. All gated by existing role checks; no role/schema rework.

## 1. Mission Trip Readiness Score (Itinerary & travel focus)

Per-trip 0–100 score based on travel/itinerary signals already on `mission_trips`:

- Travel dates locked (`start_date` + `end_date` set) — 25
- Itinerary doc exists (`itinerary_doc_url` OR `itinerary_file_path` OR `itinerary_link`) — 25
- Itinerary owner assigned (`itinerary_owner`) and due date set (`itinerary_due_date`) — 20
- Lodging confirmed (`lodging_status` = "confirmed") — 15
- Transport confirmed (`transport_status` = "confirmed") — 15

Where it appears:
- Missions module: badge + ring/progress on each team card with hover tooltip listing missing items.
- Home dashboard "Active Missions" card: shows lowest-readiness in-field or pre-trip team as a subtle warning if score < 60.

Pure function in `src/lib/mission-readiness.ts` (no DB changes). Used in `src/routes/missions.tsx` and `src/routes/index.tsx`.

## 2. Elder Care Load Balancing (# assigned)

New `CareLoadCard` on `/elder/pastoral-care` (and a compact version on `/elder`):
- Pulls PCO care list via existing `listCareList` server fn.
- Groups by `assigned_elder` field value, counts people per elder, shows avg + per-elder bars.
- Highlights elders >120% of average (overloaded) and <60% (underloaded).
- "Unassigned" bucket shown separately with link to re-assign in PCO.

New file: `src/components/pastoral/CareLoadCard.tsx`. No new server fn — reuses `listCareList`. No DB changes.

## 3. Touchpoint Nudges (In-app + weekly + threshold email)

Reuses existing `pastoral-gaps.functions.ts` (red = ≥60d or never, amber = ≥45d).

**In-app:** `PastoralAttentionCard` already shows reds on home. Add an elder-scoped variant that filters to people whose `assigned_elder` matches the viewer's full name (via `getMyElderName`). Add an amber section + count.

**Weekly email (Mondays 8am):** New `/api/public/hooks/elder-touchpoint-digest` route. For each elder (full_name in user_roles=elder), build list of their reds + ambers from `pco_touchpoints` + `pco_pastoral_notes`, render via existing email infra (`@/lib/email-templates/`), enqueue per-elder via `enqueue_email` RPC. Skip elders with 0 gaps. `pg_cron` job calls it weekly.

**Threshold email (per-person crossing 45d):** New `/api/public/hooks/elder-touchpoint-threshold` running daily at 8am. For each person, compute days since last contact. Track previously-notified state in a new tiny table `elder_threshold_notifications(pco_person_id text pk, last_threshold int, notified_at timestamptz)`. Send a single email to the assigned elder the day a person first crosses 45 or 60; reset when a fresh touchpoint is logged.

DB change: create `elder_threshold_notifications` table with GRANTs + RLS (service_role only).

Cron jobs added via `supabase--insert` after route is deployed.

## 4. "This Week" AI Digest (Home card + Monday email to core + elders)

**Home card** (`src/components/dashboard/ThisWeekDigest.tsx`):
- Server fn `getThisWeekDigest` (role-aware) gathers: upcoming calendar events (next 7d), pre-trip missions starting soon, pastoral reds/ambers (elders only), open elder action items (elders only), upcoming meetings, low-readiness events.
- Calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a tight system prompt: 3–5 sentence paragraph naming the top 3 things this person should pay attention to this week. Returns `{ paragraph, generated_at }`.
- Cached per-user per-day in memory on the server fn; client shows skeleton, then paragraph + small "Refresh" + "as of …".

**Monday 7am email:** New `/api/public/hooks/weekly-digest-monday` route. For each user with role `core`/`meeting`/`elder`/`elder_candidate`, build their digest (reusing the same gather + AI call) and enqueue via existing email infra. Branded template `weekly-digest.tsx`. Idempotency key `weekly-digest-${userId}-${isoWeek}`. `pg_cron` Mondays 12:00 UTC (7am ET).

No DB changes for the digest itself.

## Files

New:
- `src/lib/mission-readiness.ts`
- `src/components/pastoral/CareLoadCard.tsx`
- `src/components/dashboard/ThisWeekDigest.tsx`
- `src/lib/weekly-digest.functions.ts` (auth'd `getThisWeekDigest`)
- `src/lib/email-templates/weekly-digest.tsx`
- `src/lib/email-templates/elder-touchpoint-digest.tsx`
- `src/lib/email-templates/touchpoint-threshold.tsx`
- `src/routes/api/public/hooks/weekly-digest-monday.ts`
- `src/routes/api/public/hooks/elder-touchpoint-digest.ts`
- `src/routes/api/public/hooks/elder-touchpoint-threshold.ts`

Edited:
- `src/routes/missions.tsx` — show readiness on cards
- `src/routes/index.tsx` — render `ThisWeekDigest`; readiness warning on Active Missions
- `src/routes/elder.pastoral-care.tsx` + `src/components/pastoral/PastoralCareList.tsx` — embed `CareLoadCard`
- `src/components/dashboard/PastoralAttentionCard.tsx` — add amber list + viewer scoping
- `src/lib/email-templates/registry.ts` — register 3 new templates

DB:
- Migration: `elder_threshold_notifications` table
- pg_cron: 3 schedules (weekly Mon digest, weekly Mon touchpoint, daily threshold)

## Notes

- All server fns use `requireSupabaseAuth` except public cron routes, which use the apikey-bearer pattern (`/api/public/*`) and load `supabaseAdmin` inside the handler.
- AI calls go to Lovable AI Gateway with `LOVABLE_API_KEY` (already in secrets). I'll cap each digest call at ~500 tokens.
- No new email provider — uses existing scaffolded `enqueue_email` + transactional infra.
