
# Annual Budget Workflow

Fiscal year: July 1 – June 30. This adds a **Budget** track to Annual Planning that runs alongside the existing Calendar and MAP tracks, plus a lightweight "10k-ft plan" that later hydrates the full MAP.

## Timeline

```text
Mar 1 ─ Core (you) prompted: upload 12-mo spending report (Feb–Feb) per ministry
        │
        ├─▶ Each leader notified: rough budget request + 10k-ft plan due Mar 31
        │
Mar 31 ─ Rough request + 10k-ft plan submitted
        │
Apr 1  ─ Core prompted: paste Google Sheet link per leader
        │
        ├─▶ Leader notified with sheet link, works in Sheets, clicks "Submitted"
        │
        ├─▶ Core notified: review, add feedback in app, submit feedback
        │
        └─▶ Leader notified with feedback, can revise → re-submit
        
Later  ─ Leader starts full MAP → 10k-ft answers pre-fill MAP fields as editable drafts
```

## Data Model

New tables (all RLS-gated: owner + core; core-only for admin fields):

- **`budget_cycles`** — one per fiscal year: `fiscal_year`, `status` (setup / rough_planning / sheet_submission / feedback / complete), key dates.
- **`ministry_budget_submissions`** — one per (cycle, leader/ministry area):
  - `user_id`, `ministry_area`, `cycle_id`
  - `spending_report_uploaded_at`, `spending_report_path` (Storage: new `budget-reports` bucket)
  - `rough_status` (not_started / in_progress / submitted), `rough_submitted_at`
  - `sheet_url` (core pastes), `sheet_status` (awaiting_link / in_progress / submitted / feedback_provided / revised), `sheet_submitted_at`
  - `feedback_body` (rich text), `feedback_submitted_at`, `reviewed_by`
- **`ministry_rough_budget_lines`** — line items on the rough request: `submission_id`, `category_id` (nullable), `category_name`, `amount_annual`, `note`, `sort_order`. Category list seeded from `budget_categories` for the FY.
- **`ministry_high_level_plans`** — the "10k-ft" plan tied to a submission: `purpose`, `top_goals` (jsonb array of `{ statement, why }`), `swot_seeds` (jsonb: strengths/weaknesses/opportunities/threats string arrays), `notes`. `carried_to_map_id` (nullable FK to `ministry_action_plans`) tracks the hydration.

Notifications reuse the existing app-email transactional pipeline plus in-app dashboard tasks (same pattern as onboarding/MAP prompts). All emails: pre-rendered React Email templates.

## Ministry / Leader Resolution

We need a canonical "who is a ministry leader" list. Reuse `MINISTRY_AREAS` from `ministry-plans.functions.ts` and a new `ministry_leader_assignments` table (`user_id`, `ministry_area`, `active`) — core-managed in a small admin panel inside Annual Planning. Cycle kickoff creates one `ministry_budget_submissions` row per active assignment.

## Routes / UI

New under `/annual-planning`:

- `/annual-planning/budget` — overview:
  - **Core view**: cycle status, matrix of ministries × (report / rough / sheet / feedback). Actions: "Upload 12-mo report", "Paste sheet link", "Review submission", "Send feedback".
  - **Leader view**: their submission card with the 4 stages, clear CTAs.
- `/annual-planning/budget/$submissionId` — leader detail page:
  - **Stage 1**: 12-mo report viewer (PDF/CSV inline).
  - **Stage 2**: Rough budget line-item table (category dropdown + annual amount + note). Prior-year actuals shown side-by-side pulled from `budget_actuals`.
  - **Stage 3**: 10k-ft plan editor (purpose textarea, top-3 goals repeater, SWOT seed lists).
  - **Stage 4**: Sheet link + "Mark submitted" button + feedback view.
- `/annual-planning/budget/admin` — core-only cycle management (open cycle, upload reports, paste sheet links, review submissions, send feedback).

Replace the "coming soon" placeholder at `src/routes/annual-planning.budget.tsx` with the overview above.

## Automation (pg_cron → server routes)

Under `src/routes/api/public/hooks/`:

- `budget-cycle-mar1.ts` — on Mar 1: create/ensure cycle, create submissions for every active leader assignment, notify **core** (dashboard task + email) to upload reports.
- `budget-cycle-apr1.ts` — on Apr 1: advance cycle to `sheet_submission`, notify core to paste sheet links, notify leaders their rough phase is closed.
- `budget-rough-due-nudge.ts` — daily during March: nudge leaders with `rough_status != 'submitted'` (3 days before + on due date).

`pg_cron` jobs installed via `supabase--insert`, calling stable published URL with anon key.

## Notifications

React Email templates in `src/lib/email-templates/`:

- `budget-report-ready` → leader (report uploaded, rough phase open)
- `budget-rough-nudge` → leader (X days remaining)
- `budget-sheet-ready` → leader (sheet link posted)
- `budget-sheet-submitted` → core (leader clicked submit)
- `budget-feedback-ready` → leader (feedback available)
- `budget-report-upload-needed` → core (Mar 1 kickoff)

In-app dashboard cards: extend the existing "action items" surface with cycle-driven items (source: `annual_budget`) so they show on the home page.

## 10k-ft → MAP Hydration

When a leader opens a new MAP for the same `calendar_year` (or same FY window), the MAP editor checks for a `ministry_high_level_plans` row with matching `user_id` + `ministry_area` where `carried_to_map_id IS NULL`. If found:

- Pre-fill `purpose` from 10k-ft purpose.
- Pre-fill `goals` with the top goals as editable draft `GoalEntry` items (empty execution_steps, no completion date).
- Pre-fill `strengths / weaknesses / opportunities / threats` as editable seed bullets.
- Show a small banner: "Seeded from your March 10k-ft plan — feel free to edit or delete."
- On first save, set `carried_to_map_id` so the seeding only happens once.

The 10k-ft plan itself remains viewable read-only from the MAP header ("View original 10k-ft plan").

## Storage

New private bucket `budget-reports`. Path convention: `budget-reports/{fiscal_year}/{user_id}/12mo-report.{ext}`. Signed URLs for viewing.

## Security / Access

- Leaders: read/write only their own submission and 10k-ft plan.
- Core: full read/write across cycle, submissions, feedback, admin panel.
- All server logic gated with `requireSupabaseAuth` + role checks; storage bucket policies mirror table RLS.

## Technical Notes

- New files: `src/lib/annual-budget.functions.ts`, `src/lib/annual-budget-cycle.server.ts`, budget routes, 6 email templates, 3 hook routes, one migration for tables + RLS + GRANTs + storage bucket policies.
- Reuses: `RichTextEditor`, `DueDatePicker`, `useAutosave`, existing PDF viewer, `budget_categories` / `budget_actuals` for prior-year context, transactional email queue.
- No changes to Calendar or existing MAP flow other than the hydration banner in the MAP editor.

## Out of scope (for now)

- Auto-generating per-leader Google Sheets from a template (you paste links manually — as chosen).
- Multi-round feedback threading (single feedback + optional leader revision only).
- Board/finance-committee approval workflow after your feedback — can layer on later.
