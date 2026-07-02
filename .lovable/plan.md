
## Goal
Untangle "who can do what" so the Users page is scannable, role assignment is centralized, and hub access stops depending on hardcoded user IDs.

## 1. Role model (keep the split — staff tier + hub flags)

Roles stay in `user_roles` (already the pattern). One staff tier per user + independent hub flags.

- **Staff tier (mutually exclusive, exactly one):** `core`, `meeting`, `extended`
- **Elder track (mutually exclusive, 0–1):** `elder`, `elder_candidate`
- **Deacon track (mutually exclusive, 0–1):** `deacon`, `chair_of_deacons`
- **Independent flags (0+):** `cg_coach`, `serve_leader_admin` *(new)*

### DB changes
- Add `serve_leader_admin` to the `app_role` enum.
- Seed the current owner (id `3a7c1973-...`) as `serve_leader_admin` so nothing breaks.
- Add helper `public.is_serve_leader_admin(uuid)` (security definer) mirroring `is_cg_coach`.
- Audit RLS policies that reference the hardcoded id (if any) and switch to the helper.

### App changes
- `auth-context.tsx`: replace `SERVE_LEADERS_HUB_OWNER_ID` + id check with `hasServeLeadersHubAccess = roles.includes("serve_leader_admin")`.
- `serve-leaders.tsx` gate: uses the new flag.
- Add `setUserServeLeaderAdmin` server fn (mirrors `setUserCgCoach`).

## 2. Users page redesign (one row + edit drawer)

Replace the wide 13-column grid with a compact list + a right-side drawer.

**Row (compact):**
```
[avatar]  Full name                         Last login
          email                             Joined
          [Core] [Elder] [Chair-Deacon] [CG Coach] [Serve Leaders]   [Edit] [·]
```
Chips are colored, only shown when the user has that access. Row is clickable → drawer.

**Top bar:** search input, filter chips (All / Staff / Elders / Deacons / CG Coaches / Serve Leaders / No access), Bulk invite, Invite user.

**Edit drawer** (Sheet) — grouped, with helper text:
- **Staff tier** — radio (Staff Pastor / Meeting / Extended) + one-line explanation of what each unlocks
- **Elder track** — radio (None / Candidate / Full Elder)
- **Deacon track** — radio (None / Deacon / Chair of Deacons)
- **Additional hubs** — switches: CG Coach, Serve Team Leaders admin
- **Danger zone** — Remove user

Save is per-section (auto-save on change like today) with a small "Saved" indicator. Legend cards at the bottom of the current page get replaced by inline helper text in the drawer + a single "What each tier can do" collapsible reference at the top.

**Remove:** the "3 role cards" strip below the table, the horizontal scrolling grid, and the confirm-via-`window.confirm` for delete (replace with AlertDialog).

## 3. First-login profile prompt

- Add `profiles.onboarded_at` (nullable timestamp).
- On first visit anywhere in the app, if `onboarded_at IS NULL`, show a modal: confirm full name + upload avatar (uses existing `profiles.avatar_url`). Save sets `onboarded_at = now()`.
- Dismiss = "Later" (still marks onboarded to avoid nagging), but name is required if blank.

## 4. Consistency pass on access checks

Audit the codebase for these anti-patterns and fix:
- Any remaining checks against `SERVE_LEADERS_HUB_OWNER_ID` → use `hasServeLeadersHubAccess`.
- Sidebar / AppShell links: show a hub link iff the user has access; today Serve Leaders relies on id match.
- Confirm `useAuth` exposes a single canonical helper per hub (`hasElderHubAccess`, `hasServeLeadersHubAccess`, `isCgCoach`, `hasStaffAccess`) and that route guards use those (not ad-hoc `roles.includes(...)`).

## 5. Out of scope (intentionally)

- No new hub_memberships table — you chose the flag model.
- No Google/Tour prompts on first login — only profile completion.
- No changes to what each staff tier can *do* inside modules; this is purely about assignment, discoverability, and gates.

## Technical notes
- Enum extension: `ALTER TYPE app_role ADD VALUE 'serve_leader_admin'` (own migration; enum values can't be added inside the same tx as their use).
- Seed the current owner via a second migration or the `insert` tool after the enum is live.
- `listUsers` already returns roles; no server change needed for the redesigned table beyond the new `setUserServeLeaderAdmin` fn.
- Onboarding modal lives in `AppShell` so it fires once regardless of landing route.

## Files touched (approx.)
- `src/routes/users.tsx` — rewrite as list + drawer
- `src/components/users/UserEditDrawer.tsx` — new
- `src/components/users/OnboardingProfileDialog.tsx` — new, mounted in `AppShell`
- `src/lib/users.functions.ts` — add `setUserServeLeaderAdmin`, `completeProfileOnboarding`
- `src/lib/auth-context.tsx` — drop hardcoded id, add serve-leader flag helper
- `src/routes/serve-leaders.tsx` — use new flag
- `src/components/AppSidebar.tsx` — show Serve Leaders link based on flag
- Migrations: enum value, `profiles.onboarded_at`, helper fn, seed owner
