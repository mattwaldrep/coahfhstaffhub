import { describe, it, expect } from 'vitest';
import { canEditPcoChecklist, canPushPcoTask, pcoTaskFields } from './pco-collaboration';
describe('PCO collaboration permissions', () => {
  it('keeps extended staff checklist view-only', () => expect(canEditPcoChecklist(['extended'])).toBe(false));
  it('allows calendar admins to manage checklist tasks', () => expect(canEditPcoChecklist(['calendar_admin'])).toBe(true));
  it('does not allow unrelated roles to push another person’s task', () => expect(canPushPcoTask(['elder'], 'one', 'two')).toBe(false));
  it('allows staff to push their own task', () => expect(canPushPcoTask(['extended'], 'one', 'one')).toBe(true));
});
describe('PCO task occurrence identity', () => {
  it('keeps an evening event on its Central calendar date', () => {
    const fields = pcoTaskFields({ name: 'Team night', starts_at: '2026-10-24T01:00:00Z', instance_id: '123' }, 'Prepare');
    expect(fields.title).toBe('Team night (10/23/2026) — Prepare');
  });
  it('links the exact occurrence rather than a recurring series', () => {
    expect(pcoTaskFields({ name: 'Team', starts_at: '2026-10-23T12:00:00Z', instance_id: '456' }, 'Prepare').notes).toContain('instance=456&month=2026-10');
  });
});import { channelTaskLabel } from './event-channels';
import { isCommsLabel } from './event-readiness';
describe('PCO beta channel tasks', () => {
  it('counts every promotion and comms channel task toward comms readiness', () => {
    for (const key of ['pco', 'social_ads', 'direct_email', 'text_message']) expect(isCommsLabel(channelTaskLabel(key))).toBe(true);
  });
  it('rejects unknown channels', () => expect(channelTaskLabel('fax')).toBeNull());
});
