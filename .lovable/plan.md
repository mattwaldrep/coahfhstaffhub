# Sunset the old calendar; make the PCO calendar the main calendar

## What changes

1. **PCO view becomes the main calendar**
   - `/calendar` shows the PCO-driven calendar (the current beta: month spans, search, feeds/tags filters, saved default view, event card with owner, rooms, childcare, comms, checklists, comments, Google Tasks).
   - `/calendar/pco` redirects to `/calendar` so existing bookmarks keep working.
   - No "create event" button anywhere — events are created in Planning Center, per our earlier decision.

2. **Old calendar becomes a read-only archive**
   - Moved to `/calendar/archive`: old events stay viewable (list + detail), but all add/edit/delete controls, the PCO signup import dialog, and room/template management are removed from it.
   - All existing event data stays in the database untouched.

3. **Staff meeting announcement picker switches to PCO**
   - The Announcement 1–3 and Ministry Highlight pickers list upcoming PCO calendar events instead of old-calendar events.
   - Selections still show and push as `Event Name (MM/DD)`; the PCO Services push (including Announcement 3 plan-item creation) is unchanged.

4. **Planning cycles retired**
   - The planning-cycle pages, sidebar links, and the four cycle-reminder scheduled hooks are removed.
   - Planning-cycle tables stay in the database, marked deprecated, so history isn't lost.

5. **Exports and public calendar re-pointed to PCO**
   - PDF/CSV export works off PCO events (date range + tag filters).
   - The public calendar page shows PCO events instead of old-calendar events.
   - (You didn't check these two — say the word if you'd rather drop either one.)

6. **Registrations import queue — left in place for now**
   - As discussed: registrations published to PCO Calendar already appear via the Registrations feed, so the queue is redundant. It stays until you confirm retirement; removing it later is a small follow-up.

## What stays the same

- Roles and permissions (calendar admins, editors) carry over to the new main calendar.
- Old-calendar data, sub-calendar records, and planning-cycle history are preserved in the database.
- The beta's collaboration features (checklists, comments, owner reassignment, rooms, childcare, comms channels) work exactly as they do today.

## Technical notes

- Route work: `src/routes/calendar.tsx` replaced by the beta implementation; beta file `src/routes/calendar_.pco.tsx` becomes a redirect; new read-only `src/routes/calendar_.archive.tsx` holds the old list UI stripped of mutations.
- Staff meeting picker: swap the event source in the Sunday Announcements & Highlights section to the PCO instance fetch (existing `getPcoCalendar` server function, short date window).
- Removal: `calendar_.planning*.tsx` routes, planning links in sidebar/calendar settings, and `src/routes/api/public/hooks/calendar-cycle-*.ts` cron hooks; planning tables get `COMMENT ON TABLE ... 'DEPRECATED'` in one migration.
- Export/public pages: change their data source from the events table to the PCO instance fetch; filter UI switches from sub-calendars to PCO tags.
- No old-calendar data is deleted anywhere.
