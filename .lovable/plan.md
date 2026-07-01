
## Ministry Action Plan

A new top-level "Ministry Plans" section any signed-in staff hub user can use to author an annual plan for a ministry area. Staff Pastors (renamed from `core`) get an admin listing to review and approve.

### Navigation & access
- Add "Ministry Plans" to the app sidebar for all authenticated users.
- Anyone signed in can create/edit their own plans.
- Only Staff Pastors see the admin listing and can move plans through `under_review` / `approved`.
- Rename the `core` role label everywhere it's user-facing to "Staff Pastor" (DB enum value stays `core` to avoid a destructive migration; UI labels + any copy update).

### Data model
New table `ministry_action_plans`:
- `id`, `user_id` (auth.users), `leader_name`, `ministry_area` (enum: Worship, AV, Prayer, Hospitality, Set Up, Creative, Men's, Women's, Kids, Youth, Connect, Other), `calendar_year` (int)
- `purpose` (text)
- `programs` (jsonb array: `{name, cadence, description}`)
- `org_structure` (text)
- `strengths`, `weaknesses`, `opportunities`, `threats` (jsonb text arrays)
- `goals` (jsonb array: `{goal_statement, completion_date, significant_others, execution_steps: string[]}`)
- `status` ('draft' | 'submitted' | 'under_review' | 'approved'), `submitted_at`, `reviewed_by`, timestamps
- Unique constraint on `(user_id, ministry_area, calendar_year)`

RLS/GRANTs:
- Owners: full CRUD on their rows while `status = 'draft'`; read always; can transition draft → submitted.
- Staff Pastors (`has_role(uid, 'core')`): SELECT all + UPDATE `status`/`reviewed_by`.
- No anon access.

### Routes
- `/ministry-plans` — user's own plans list + "New plan" button (pick area + year, enforces uniqueness).
- `/ministry-plans/$planId` — multi-step editor (default view for owner while draft).
- `/ministry-plans/$planId/review` — read-only formatted document view (owner sees before submitting; Staff Pastors see always).
- `/ministry-plans/admin` — Staff-Pastor-only listing with filters (ministry_area, status), opens any plan's review view.

All under `_authenticated/`.

### Multi-step editor UX
Steps (progress indicator across the top, clickable to jump; validates but doesn't block navigation between steps while in draft):
1. Header — leader name, ministry area (dropdown), calendar year.
2. Purpose — long-form textarea.
3. Programs — repeatable cards (add/remove); name, cadence, description.
4. Organizational Structure — long-form textarea.
5. SWOT — 2x2 grid on desktop / stacked on mobile, each quadrant is an add/remove bullet list.
6. Goals — accordion list, default 3 empty collapsible cards; each card has statement, completion date (shadcn date picker), significant others, and a repeatable execution_steps list. Add/remove goals; no cap.
7. Review — clean formatted document (headings, prose, definition-list style for header fields, bullets for SWOT/execution steps, cards for programs/goals). "Edit" link per section jumps back to that step. Final "Submit for Review" button flips status to `submitted`.

Autosave:
- Every field autosaves on blur (text/textarea) or on change (selects, dates, add/remove). Debounced server function call `updateMinistryPlan` patches the specific field/array.
- Small "Saved" / "Saving…" indicator near the progress bar. No manual save button.
- Status stays `draft` until Submit for Review.

### Admin view
- `/ministry-plans/admin` — table: leader, ministry area, year, status, submitted date. Filter dropdowns for `ministry_area` and `status`. Row click → review page.
- On the review page, Staff Pastors see status controls: "Mark under review", "Approve", "Send back to draft".

### Technical details
- Server functions in `src/lib/ministry-plans.functions.ts` (all `.middleware([requireSupabaseAuth])`): `listMyPlans`, `listAllPlans` (staff-pastor gated via `has_role`), `getPlan`, `createPlan`, `updateMinistryPlan(planId, patch)`, `submitPlan`, `setPlanStatus` (staff-pastor gated).
- Uniqueness handled by DB constraint; `createPlan` catches conflict and returns existing plan id.
- Autosave uses a shared `useAutosave` hook wrapping `useMutation` with debounce (500ms).
- Review view is a single presentational component reused by owner preview and admin view.
- Sidebar entry added to `AppSidebar.tsx`; icon: `ClipboardList` from lucide.
- No changes to existing role gating helpers beyond adding a UI label constant; `has_role(uid, 'core')` continues to power Staff Pastor checks.

### Files touched
- Migration: new table, enum, RLS, GRANTs, unique constraint, updated_at trigger.
- `src/lib/ministry-plans.functions.ts` (new).
- `src/routes/ministry-plans.index.tsx`, `ministry-plans.$planId.tsx`, `ministry-plans.$planId.review.tsx`, `ministry-plans.admin.tsx` (new).
- `src/components/ministry-plans/` — `StepHeader`, `StepPurpose`, `StepPrograms`, `StepOrgStructure`, `StepSwot`, `StepGoals`, `ReviewDocument`, `ProgressBar`, `useAutosave` hook.
- `src/components/AppSidebar.tsx` — add "Ministry Plans" entry; rename any "Core" user-facing label to "Staff Pastor".
