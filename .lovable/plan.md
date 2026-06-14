# Deacons & Joint Meetings

## What's changing

1. Two new user roles: **Deacon** and **Chair of Deacons** (assignable from the Users page, same UX pattern as Elder/Elder Candidate).
2. Joint elder meetings already have a `meeting_type = "joint"` toggle on creation. We keep that toggle and reuse the existing `elder_joint_deacon_items` table (with its three sub-sections: *What we need to know*, *How can we serve / resource*, *Upcoming events*).
3. On a joint meeting detail page, elders now see **both** the standard elder agenda **and** a new "Deacons & Elders" block (the three sub-sections). On a standard meeting, no change.
4. Deacons (plain + Chair) get a stripped-down Elder Hub: only joint meetings appear in their list, and inside a meeting they only see the Deacons & Elders block — no other sections, no action items, no executive content, no sidebar items beyond the Elder Hub.
5. Write access on the Deacons & Elders block: **Chair of Deacons** and **full Elders** only. Plain Deacons and Elder Candidates are read-only.

## Where the work lands

**Database (migration)**
- Add `'deacon'` and `'chair_of_deacons'` to the `app_role` enum.
- New helper functions `public.has_deacon_access(uuid)` and `public.is_chair_of_deacons(uuid)`.
- Update RLS on `elder_meetings`, `elder_joint_deacon_items`, and `elder_section_notes` (for the joint section notes only) so deacons can SELECT joint meetings + joint items, and chair-of-deacons can INSERT/UPDATE/DELETE joint items + joint section notes. Standard elder content stays elder-only.

**Auth context (`src/lib/auth-context.tsx`)**
- Extend `AppRole` union with the two new roles.
- Add `isDeacon`, `isChairOfDeacons`, `hasDeaconAccess` flags.
- Treat deacon access as a path into the Elder Hub (so the existing `hasElderAccess` gate either widens to include deacons, or we add a parallel `hasElderHubAccess`).

**Sidebar / shell**
- Show the Elder Hub link for deacons.
- For deacons, only the "Meetings" tab is visible inside the Elder Hub (no Motions / Pastoral Care / Archive / Settings / Overview).

**Server functions (`src/lib/elder.functions.ts` + `src/server/elder.server.ts`)**
- New `assertDeaconOrElderAccess` helper.
- `listElderMeetings`: if caller is deacon-only (no elder access), filter to `meeting_type = 'joint'`.
- `getElderMeeting`: if deacon-only, return only `{ meeting, jointItems }` (and a joint-section notes row if we add one) — strip agenda, section notes, action items, attendees. If meeting is not joint, 404 for deacons.
- `upsertJointItem` / `deleteJointItem`: allow if caller is full elder OR chair of deacons. Block plain deacons + elder candidates from writes.
- Joint-section free-form notes (if we keep them — see Open question) gated the same way.

**Routes / UI**
- `src/routes/elder.meetings.$meetingId.tsx`: always render `StandardSections` for elders/candidates; additionally render a new `JointDeaconSection` card (the three sub-sections) when `meeting_type === "joint"`. For deacon-only viewers, render *only* the `JointDeaconSection`, and hide the status dropdown, action items block, and exec controls. Pass `canEditJoint` (elder OR chair) into the section so plain deacons see a read-only view.
- `src/routes/elder.tsx`: filter the tab list for deacon-only users to just "Meetings".
- `src/routes/elder.index.tsx` / `elder.motions.tsx` / `elder.pastoral-care.tsx` / `elder.archive.tsx` / `elder.settings.tsx`: redirect deacon-only users to `/elder/meetings`.
- `src/routes/users.tsx`: add Deacon / Chair-of-Deacons assignment controls (mirroring the existing Elder tier selector). Likely a new `setUserDeaconTier` server function in `users.functions.ts` analogous to `setUserElderTier`.
- `src/routes/elder.meetings.index.tsx`: keep the existing Type select (Standard / Joint Elder/Deacon Meeting) — that's the per-meeting toggle the user asked for. Hide the "New meeting" button for deacon-only users.

**Memory**
- Update `mem://security` (or add a deacon rule) so future scanners know: deacons must never see elder agenda, executive session, action items, or non-joint meetings; chair-of-deacons writes are scoped to joint items + joint section notes.

## Open question I'll resolve while building

The existing joint sub-sections store one-line entries (title + body) but have no shared free-form notes field. I'll add a single notes textarea per sub-section *only* if it's trivial; otherwise I'll leave the current item-list UX as-is and we can iterate. Either way the access rules above hold.

## Out of scope

- Auto-scheduling which meetings are joint (you confirmed it's just the per-meeting toggle).
- Deacon-only motions, pastoral care, or archive views.
- Migrating any historical joint meetings — existing rows already have `meeting_type = 'joint'` and will work.
