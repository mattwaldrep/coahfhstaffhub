## Missions page — multi-view redesign

Add a view switcher to `/missions` so teams can be viewed four ways. Keep the existing data model — this is purely a presentation change.

### View switcher (top of page)
Segmented control next to the existing status filter pills: **Timeline · Kanban · Table · Calendar**. Selection persists in `localStorage` (`missions:view`) so each user reopens to their last view.

### 1. Timeline (by trip date)
- Trips sorted by `start_date` ascending.
- Grouped headers: **In field now**, **This month**, **Next month**, **Later this year**, **Next year+**, **No date set**.
- Default scope: hide `complete` and `cancelled`; small "Show past/completed" toggle adds a **Past** group at the bottom.
- Each row: date range · church name · leader · status pill · readiness bar/badge · quick contact icons. Click opens the existing edit dialog.

### 2. Kanban (current)
- Unchanged — existing 6-column board.

### 3. Table / list
- Sortable columns: Church, Start, End, Leader, Focus, Status, Readiness (%).
- Same default scope (upcoming + in-field); status filter pills still apply.
- Row click opens edit dialog. Status cell is the inline status dropdown.

### 4. Calendar
- Month grid (reuse styling from `/calendar` where reasonable, but standalone — no event data, just trip bars).
- Each trip rendered as a horizontal bar spanning `start_date`→`end_date`, colored by status.
- Prev/next month controls; trips without dates listed in a sidebar "Unscheduled" panel.
- Click a bar → edit dialog.

### Shared behavior
- Status filter pills, "New trip" button, and edit dialog stay the same and work across all views.
- Empty states per view (e.g. "No upcoming trips" in Timeline).

### Technical notes
- All changes scoped to `src/routes/missions.tsx`. Extract each view into a small subcomponent (`TimelineView`, `KanbanView`, `TableView`, `CalendarView`) inside the same file to keep diffs contained.
- Persisted view: `useState` initialized from `localStorage.getItem("missions:view")`, write on change.
- Date grouping uses `date-fns` (already in project): `isThisMonth`, `addMonths`, `isWithinInterval`, `isPast`.
- No DB migrations, no new tables, no RLS changes.
