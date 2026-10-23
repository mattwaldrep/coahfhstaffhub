import { describe, it, expect } from 'vitest';
import { canEditPcoChecklist, canPushPcoTask, pcoTaskFields, resolvePcoEventOwner, pcoLogisticsPatch, hasPcoRoomPlan } from './pco-collaboration';
describe('PCO beta event ownership', () => {
  const people = [{ id: 'staff-one', full_name: 'Test coordinator' }];
  it('uses the reassigned Hub owner instead of the PCO owner', () => {
    expect(resolvePcoEventOwner('staff-one', 'PCO owner', people)).toBe('Test coordinator');
  });
  it('restores the PCO owner when the Hub override is cleared', () => {
    expect(resolvePcoEventOwner(null, 'PCO owner', people)).toBe('PCO owner');
  });
  it('leaves the event without an owner when neither source has one', () => {
    expect(resolvePcoEventOwner(null, null, people)).toBeNull();
  });
});
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
import { roomRequestTaskLabels } from './pco-collaboration';
describe('PCO beta room request tasks', () => {
  it('creates submitted and received tasks for rented Planning Center rooms', () => {
    expect(roomRequestTaskLabels('Fellowship Hall', true)).toEqual(['Room request form submitted – Fellowship Hall', 'Room request form received – Fellowship Hall']);
  });
  it('skips the office', () => { expect(roomRequestTaskLabels('Office', true)).toEqual([]); });
  it('skips write-in rooms', () => { expect(roomRequestTaskLabels('Back patio', false)).toEqual([]); });
});

describe('PCO beta logistics options', () => {
  it('records no room needed without clearing the event location', () => {
    expect(pcoLogisticsPatch({ noRoomNeeded: true })).toEqual({ no_room_needed: true, rooms_note: null });
    expect(hasPcoRoomPlan(true, [], null)).toBe(true);
    expect(hasPcoRoomPlan(false, [], null)).toBe(false);
    expect(roomRequestTaskLabels(null, false)).toEqual([]);
  });
  it('clears the exemption when a catalog or write-in room is selected', () => {
    expect(pcoLogisticsPatch({ roomId: '123' })).toEqual({ no_room_needed: false });
    expect(pcoLogisticsPatch({ roomsNote: 'Home' })).toEqual({ no_room_needed: false });
  });
  it('saves childcare independently and supports unchecking it', () => {
    expect(pcoLogisticsPatch({ childcareNeeded: true })).toEqual({ childcare_needed: true });
    expect(pcoLogisticsPatch({ childcareNeeded: false })).toEqual({ childcare_needed: false });
  });
});
