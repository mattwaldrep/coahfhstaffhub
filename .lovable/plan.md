Move the Checklists menu item out of the SECONDARY group and nest it as a child under Calendar, alongside Annual Planning, Classes, and Rooms.

**What changes:**
- In `src/components/AppSidebar.tsx`, move the Checklists entry from `SECONDARY` into `Calendar`'s `children` array.
- Checklists remains gated to `isCore` (same as today).

**Result:**
- Staff Hub → Calendar expands to show: Annual Planning, Classes, Rooms, Checklists.
- "More" section loses one top-level item, dropping its count from 5 → 4 visible items.