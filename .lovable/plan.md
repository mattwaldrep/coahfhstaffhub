## Goal
In the Pastoral Care person card, add a button that opens the device's native texting app with a draft message to that person, using their phone number from Planning Center.

## Changes

### 1. Fetch phone numbers from PCO (`src/server/pco.server.ts`)
- Update `fetchCareList` to request phones: change include to `include=field_data,phone_numbers`.
- From `included`, collect `PhoneNumber` records and match each person via `relationships.phone_numbers.data[]`.
- Pick the primary phone (`attributes.primary === true`) else first mobile/location, else first available.
- Extend `PcoPerson` type with `phone: string | null`.
- Cache key unchanged (still per list_id + field_ids); cached value now includes phone.

### 2. Surface phone through server fn (`src/lib/pastoral-care.functions.ts`)
- Include `phone` in the people payload returned to the client (no auth-model change; same `core/elder` gating already in place).

### 3. Add Text button in person card (`src/components/pastoral/PastoralCareList.tsx`)
- When the card is open for a person, render a "Text" button (lucide `MessageSquare` icon, semantic tokens).
- Disabled with tooltip "No phone on file" when `phone` is null.
- onClick: normalize digits, build `sms:+1XXXXXXXXXX?&body=<encoded draft>` and `window.location.href = href` (works on iOS/Android to open native Messages with prefilled draft; desktop falls back to OS handler).
- Draft body: short default like `Hi {firstName}, this is {currentUserFirstName} from CoAH — ` (current user from existing profile/session context already used in this component; if not available, omit the signer part).

## Out of scope
- No new in-app messaging UI, no DB writes, no PCO writes, no changes to roles/RLS.

## Technical notes
- PCO People API `PhoneNumber` attributes: `number`, `location`, `primary`, `e164` (when available). Prefer `e164`; fall back to digits-only of `number` with `+1` prefix if 10 digits.
- `sms:` URI uses `?&body=` (Android) and `&body=` after a number works on both major platforms; we'll use `sms:<number>?&body=<encoded>` which is the widely compatible form.
