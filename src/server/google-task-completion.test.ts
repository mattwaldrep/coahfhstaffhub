import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), token: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/server/google-tasks.server', () => ({ ensureAccessTokenForUser: mocks.token }));
import { syncGoogleTaskCompletions } from './google-task-completion.server';

describe('Google Tasks completion sync', () => {
  const writes: Array<unknown> = [];
  let items: Array<{ id: string; completed: boolean; google_task_id: string }>;
  beforeEach(() => {
    vi.clearAllMocks(); writes.length = 0;
    items = [{ id: 'hub-task', completed: false, google_task_id: 'google-task' }];
    mocks.token.mockResolvedValue('fixture-token');
    mocks.from.mockImplementation(() => {
      let updating = false;
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        update: (value: unknown) => { updating = true; writes.push(value); return query; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: updating ? null : items, error: null })),
      };
      return query;
    });
  });
  it('marks a Hub task complete when Google reports completed, including a hidden task on page two', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ nextPageToken: 'page-two' }))
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'google-task', status: 'completed', hidden: true }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await syncGoogleTaskCompletions('staff-user')).toEqual({ checked: 1, updated: 1 });
    expect(writes).toEqual([{ completed: true }]);
    const url = fetchMock.mock.calls[1][0] as URL;
    expect(url.searchParams.get('showHidden')).toBe('true');
    expect(url.searchParams.get('showCompleted')).toBe('true');
    expect(url.searchParams.get('pageToken')).toBe('page-two');
  });
  it('mirrors a reopened Google task without duplicating it', async () => {
    items[0].completed = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [{ id: 'google-task', status: 'needsAction' }] })));
    await syncGoogleTaskCompletions('staff-user');
    expect(writes).toEqual([{ completed: false }]);
  });
  it('does not change a Hub task when its Google task is absent or deleted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items: [{ id: 'google-task', status: 'completed', deleted: true }] })));
    expect((await syncGoogleTaskCompletions('staff-user')).updated).toBe(0);
    expect(writes).toEqual([]);
  });
  it('reports a Google failure instead of treating tasks as incomplete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(syncGoogleTaskCompletions('staff-user')).rejects.toThrow('Google Tasks sync failed (401)');
    expect(writes).toEqual([]);
  });
});