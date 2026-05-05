# Fix the Google Tasks 403

## What's actually happening

The 403 "you do not have access to this page" is **not** a bug in our app. The OAuth flow is working — we're successfully redirecting to Google, and Google is rejecting your account at the consent screen. This specific wording almost always means **your OAuth client in Google Cloud Console is in "Testing" mode and your email isn't on the Test Users list** (or the consent screen isn't fully configured).

Lovable does not have a built-in Google Tasks connector — Tasks is not in the connector catalog (Calendar, Drive, Gmail, Docs, Sheets are, but not Tasks). So "switch to a simpler approach" means one of two things below.

## Two options — you pick

### Option A — 5-minute fix to your existing OAuth client (recommended)

Keep everything we built. You just fix the consent screen in Google Cloud Console:

1. Go to Google Cloud Console → **APIs & Services → OAuth consent screen**
2. Under **Test users**, click **+ Add users** and add the email address of every staff member who will connect their Google Tasks (start with your own: `mwaldrep@coahchurch.org`)
3. Make sure **Tasks API** is enabled under **APIs & Services → Library**
4. Confirm the redirect URI is in your OAuth client's **Authorized redirect URIs**:
   - `https://id-preview--c224d9d9-eb60-469d-811f-c0e0c85402fe.lovable.app/api/google/oauth-callback`
   - `https://coahfhstaffhub.lovable.app/api/google/oauth-callback`
5. Try **Connect Google Tasks** again

If you want it to work for *anyone* without adding them as a test user, click **Publish app** on the consent screen. Since we only request the `tasks` scope (which is a sensitive scope) Google may ask you to go through verification — for an internal church staff tool with <10 users, staying in Testing mode and adding test users is by far the easiest path.

**No code changes required for Option A.**

### Option B — Drop per-user Google Tasks, push to a single shared list instead

Replace the per-user OAuth flow with a single Google account (yours) that owns one shared "Staff Action Items" task list. Everyone's action items get pushed to that one list, and individuals can subscribe to it in their own Google Tasks app.

- Removes the OAuth consent screen problem entirely (only one account ever authorizes)
- No per-user "Connect Google Tasks" button — connection is set up once
- Trade-off: tasks aren't private to each assignee; they live in a shared list

This would require:
- Removing the per-user OAuth flow from Settings
- A one-time admin connect screen (core role only)
- Changing `pushActionItemToGoogleTasks` to always use the admin token and post to a named list instead of `@default`

## My recommendation

**Do Option A first.** It takes 5 minutes, requires no code changes, and keeps the per-user model that matches how Google Tasks actually works. If you want, I can stand by while you try it and then debug whatever the next error is.

Only fall back to Option B if Google verification becomes a blocker (it won't, for ≤100 test users).

## Decision needed

Reply with "A" or "B" and I'll proceed accordingly. If A, also tell me the result after you fix the consent screen — there may be a follow-up error to chase (e.g. Tasks API not enabled, redirect URI mismatch).