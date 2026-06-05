## Sidebar reorganization — nest related items under parent features

Restructure `src/components/AppSidebar.tsx` to collapse 15 visible links into 9 top-level entries, with sub-items revealed only when the user is on a child route.

### New structure

**Staff Hub**
- Home
- Meeting
  - Sunday Review
- Calendar
  - Annual Planning
  - Classes
  - Rooms
- Decisions
- Trends

**Elder Hub** — unchanged

**More**
- Missions
- People  *(new parent, not itself a route — clicking it just toggles)*
  - Onboarding
  - Users
- Checklists
- Finance
- Settings

### Behavior

- Parent items that are real routes (Meeting, Calendar) navigate on click and show their children indented beneath them whenever the current path matches the parent or any child.
- "People" is a label-only parent with no destination; it auto-expands when on `/onboarding` or `/users`. When collapsed (icon-only sidebar), it shows just its icon and its children appear as flyout/peer icons (consistent with shadcn sidebar's icon-collapse mode).
- Sub-items render with a left indent and slightly muted styling until active.
- Active highlighting continues to use the existing `isActive` pathname logic; a parent shows the active treatment only when its own route is the exact match, while children get their own active state.
- Role gating preserved: Onboarding, Rooms, Classes, Checklists, Finance, Users still require `hasRole("core")`. If a user has no `core` access, the "People" parent is hidden entirely (since both children are core-only), and Calendar's children list shrinks to just Annual Planning (which is open to all staff).

### Technical notes

- Use shadcn's `SidebarMenuSub`, `SidebarMenuSubItem`, and `SidebarMenuSubButton` primitives (already in `src/components/ui/sidebar.tsx`) for the nested rows — no new dependencies.
- Replace the current flat `PRIMARY` and `SECONDARY` arrays with a tree shape: `{ to?, label, icon, exact?, children?: [...] }`. Items with `children` render a parent button plus a conditionally-mounted `SidebarMenuSub` when `pathname` starts with the parent's `to` (or matches any child's `to`).
- For "People" (no `to`), render the parent as a non-link `SidebarMenuButton` (button element) that toggles a local `useState` open flag, seeded `true` when on a child route.
- No route files, no `routeTree.gen.ts`, no business logic changes — this is purely a presentation change in `AppSidebar.tsx`.

### Files touched

- `src/components/AppSidebar.tsx` (only)
