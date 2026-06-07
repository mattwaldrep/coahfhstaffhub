## Goal
Add four lightweight, 100%-free intelligence features that surface as cards on the home dashboard (and richer detail in their respective hubs), powered entirely by data already in the database. No new tables, no paid APIs.

---

## 1. Forgotten Person Alarm (Pastoral Care)

**What it does:** For every person on the care list, computes days since the last touchpoint (`pco_touchpoints`) or pastoral note (`pco_pastoral_notes`) and flags amber at 45+ days, red at 60+ days.

**Where it shows:**
- On `/elder/pastoral-care`: small colored dot next to each person + sort/filter "Needs attention first."
- On home dashboard (elders only): a compact "Pastoral attention needed" card listing the top 5 reddest people with a link into Pastoral Care.

**How it's computed:** New server fn `getPastoralGaps` in `src/lib/pastoral-care.functions.ts` — joins the cached care list with `MAX(created_at)` from touchpoints + notes per `pco_person_id`, returns `{ pco_person_id, name, days_since, level: 'green'|'amber'|'red' }`.

**Access:** elder + elder_candidate only (same gating as the rest of pastoral care).

---

## 2. Congregation Health Pulse

**What it does:** A single 0–100 gauge on the home dashboard summarizing pastoral + engagement health. Tap to expand into a breakdown.

**Inputs (all free, already in DB):**
- Pastoral coverage: % of care-list people with a touchpoint/note in last 45 days (40%)
- Attendance trend: latest week vs trailing 4-week avg from `weekly_metrics` (20%)
- Community group participation trend, same shape (15%)
- Giving trend, same shape (15%)
- First-step + next-step cards in last 4 weeks vs prior 4 (10%)

Each component normalized to 0–100, then weighted average. Stored nowhere — recomputed on load (cheap).

**Where it shows:**
- New `<CongregationPulse />` card in right column of dashboard (replaces or sits next to the existing Church Metrics card). Visual: large number + colored ring + one-line "what's pulling it down" hint.
- Click → expandable detail showing each of the 5 inputs with its score and direction arrow.

**Server fn:** `getCongregationPulse` in new `src/lib/pulse.functions.ts`. Elder-gated for the pastoral component; staff (core/meeting/extended) see the card with pastoral-coverage hidden / weighted out.

---

## 3. Next Best Action

**What it does:** A single "Do this next" widget on the home dashboard that picks one highest-priority item for the signed-in user from across the app.

**Sources scanned (in priority order):**
1. Overdue action items assigned to me (`action_items.assignee_id = me AND due_date < today`)
2. My action items due today
3. Reddest forgotten person (elders only)
4. Class within 7 days missing teacher/childcare
5. Sunday Review not submitted for last Sunday (if I'm in core/meeting)
6. Stale elder motion 30+ days (elders only)

First hit wins; widget shows title, one-sentence reason, and a deep link to the right page.

**Where it shows:** Top of the dashboard, above the KPI row, as a slim accent card. Dismissible per-session (just local state; reappears next visit).

**Server fn:** `getNextBestAction` in new `src/lib/next-action.functions.ts`. Returns `{ kind, title, reason, href } | null`. Pure read; respects existing RLS via `requireSupabaseAuth`.

---

## 4. Worship Quality Trend Lines

**What it does:** On the Sunday Review page, adds a small chart strip at the top showing rolling 6-review averages per section (worship, confession, connect, sermon) over the last ~6 months. Helps spot drift.

**Inputs:** Existing `sunday_reviews` rows. Compute average rating per section per service_date across all submitters, then 6-review rolling mean. Recharts (already installed).

**Where it shows:**
- New `<WorshipTrendStrip />` at top of `/sunday-review`, 4 sparkline-style lines with current value + delta vs 6 weeks ago.
- Color a section amber if its rolling avg dropped >0.5 points vs 6 weeks ago.

**Server fn:** `getWorshipTrends` in new `src/lib/sunday-review-trends.functions.ts`. Returns per-section arrays of `{ date, rolling_avg }`. Staff-gated to match existing sunday_reviews policy (core/meeting/extended).

---

## Technical notes
- All four features are pure read-side; zero schema changes, zero migrations.
- Each new server fn uses `requireSupabaseAuth` so role gating happens server-side.
- Add new files only; small targeted edits to `src/routes/index.tsx` (add 3 cards) and `src/routes/sunday-review.tsx` (add trend strip) and `src/components/pastoral/PastoralCareList.tsx` (sort + colored dot).
- New files:
  - `src/lib/pulse.functions.ts`
  - `src/lib/next-action.functions.ts`
  - `src/lib/sunday-review-trends.functions.ts`
  - extend `src/lib/pastoral-care.functions.ts` with `getPastoralGaps`
  - `src/components/dashboard/CongregationPulse.tsx`
  - `src/components/dashboard/NextBestAction.tsx`
  - `src/components/dashboard/PastoralAttentionCard.tsx`
  - `src/components/sunday-review/WorshipTrendStrip.tsx`

## Out of scope
- No emails, no scheduled jobs, no new tables.
- No changes to pastoral data model, roles, or RLS.
- No historical backfill — trends start from existing data.
