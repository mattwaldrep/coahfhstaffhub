## Staff Onboarding Module

A configurable onboarding system: a master template admins can edit, per-hire workflows cloned from that template, and a live checklist with skip + nested subtask support.

### 1. Database schema (one migration)

**`onboarding_templates`** — master library of tasks (and nested subtasks).
- `id`, `section_name text`, `task_name text`, `description text`
- `is_onsite_only boolean default false`
- `is_active boolean default true`
- `parent_id uuid null` (self-FK for subtasks / nested subtasks — supports arbitrary depth)
- `sort_order int`, `created_at`, `updated_at`

**`onboarding_workflows`** — one row per new hire.
- `id`, `new_hire_name text`, `new_hire_email text null`, `user_id uuid null` (link to profiles if they have an account)
- `hire_type text check in ('onsite','remote','hybrid')`
- `status text` (`active`, `paused`, `completed`, `archived`)
- `start_date date`, `created_by`, `created_at`, `updated_at`

**`onboarding_tasks`** — live per-hire checklist, cloned at launch.
- `id`, `workflow_id`, `section_name`, `task_name`, `description`
- `is_completed boolean`, `completed_at`, `completed_by`
- `is_skipped boolean`, `skipped_reason text null`
- `parent_task_id uuid null` (mirrors template hierarchy)
- `sort_order int`, `source_template_id uuid null` (for traceability)

RLS: `core` role manages everything; all authenticated staff can view (matches existing patterns like `event_checklist_items`). Add `set_updated_at` triggers.

### 2. Seed data

A second migration seeds `onboarding_templates` with the full hierarchy from the spec (Arrival → End of Week Eval), preserving parent/child/grandchild nesting and flagging the four on-site-only tasks (Welcome Kit, Keys, Welcome Lunch — plus any others marked on-site). Welcome Kit description includes the supply list verbatim.

### 3. Server functions (`src/lib/onboarding.functions.ts`)

All `requireSupabaseAuth` + core role check.

- `listTemplate()` — full tree (active + inactive).
- `upsertTemplateNode({ id?, parent_id?, section_name, task_name, description, is_onsite_only, sort_order })`
- `setTemplateActive({ id, is_active })` — soft deactivate (preserves history).
- `reorderTemplateNodes({ updates: [{id, sort_order, parent_id?}] })`
- `launchWorkflow({ new_hire_name, hire_type, start_date, user_id? })` — clones every active template node into `onboarding_tasks`; if `hire_type='remote'`, sets `is_skipped=true, skipped_reason='Remote hire'` on `is_onsite_only` tasks (and their descendants).
- `listWorkflows()` / `getWorkflow({ id })` — returns workflow + tasks tree + computed progress.
- `setTaskCompleted({ task_id, completed })` / `setTaskSkipped({ task_id, skipped, reason? })`
- `addAdHocTask({ workflow_id, parent_task_id?, section_name, task_name, description? })` — per-hire customization.
- `archiveWorkflow({ id })`

Progress math: `completed / (total - skipped)` over leaf tasks only (parents with children count via their children).

### 4. Routes & UI

**`/onboarding`** — dashboard.
- "Launch onboarding" button (modal: name, hire type radio onsite/remote/hybrid, start date).
- Cards/table of active workflows: name, hire type badge, start date, progress bar, status chip.
- Filters: active / completed / archived.

**`/onboarding/$workflowId`** — live checklist.
- Header: name, hire type, start date, overall progress bar (excluding skipped), status menu (mark complete / archive).
- Grouped by `section_name`. Each section collapsible.
- Each task row: checkbox · title · description tooltip · **Skip** button (or "Unskip" if skipped) · ad-hoc add button on parents.
- Skipped rows render grayed/strikethrough and don't count toward progress.
- Subtasks visually indented (16px per depth level) with collapse chevron on any parent. Parent checkbox is tri-state derived from children; checking a parent cascades to unskipped children.
- "Add ad-hoc task" inline at section + subtask level.

**`/onboarding/templates`** — master editor (core only).
- Tree view of sections → tasks → subtasks → nested subtasks.
- Inline edit: name, description, on-site-only toggle, active toggle.
- Drag-to-reorder within parent (or up/down buttons for simplicity v1).
- "Add section", "Add task under…", "Add subtask under…".
- Deactivated nodes shown faded with restore button; future workflows skip them, existing workflows untouched.

Add `Onboarding` entry to `AppSidebar` (visible to `core` and `meeting`; editor link visible to `core` only).

### 5. Components

- `src/components/onboarding/LaunchWorkflowDialog.tsx`
- `src/components/onboarding/TaskTree.tsx` — recursive renderer used by both live checklist and template editor (mode prop).
- `src/components/onboarding/ProgressBar.tsx` — reusable, excludes skipped.
- `src/components/onboarding/TemplateNodeRow.tsx`
- `src/components/onboarding/TaskRow.tsx`

### Technical notes

- Cloning at launch (vs referencing template by FK) is intentional — matches the spec's "cloned from the master template" and lets admins edit templates later without retroactively changing in-flight onboardings.
- `parent_id` self-FK on both `onboarding_templates` and `onboarding_tasks` supports the 3-level nesting in the spec (and beyond) without a separate subtasks table.
- Remote auto-skip cascades to descendants of on-site-only parents at launch time, so a remote hire's progress isn't dragged down by unreachable children.
- Skip is reversible (re-include in progress) via the same control.
- No changes to existing modules; this is purely additive.

### Out of scope (v1)

- Email notifications to new hires / mentors.
- Per-task assignees (everything is owned by the workflow's `created_by`).
- Linking onboarding tasks into the existing `action_items` / Google Tasks sync — easy to add later using the same pattern as `checklist-tasks.functions.ts`.
- Templates per role/department (single global template now; can add `template_set_id` later without breaking schema).
