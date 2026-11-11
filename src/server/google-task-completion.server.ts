import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { ensureAccessTokenForUser } from '@/server/google-tasks.server';

export async function syncGoogleTaskCompletions(userId: string) {
  const { data: items, error } = await supabaseAdmin.from('action_items')
    .select('id,completed,google_task_id').eq('assignee_id', userId)
    .not('google_task_id', 'is', null);
  if (error) throw new Error(error.message);
  if (!items?.length) return { checked: 0, updated: 0 };
  const token = await ensureAccessTokenForUser(userId);
  const tasks = new Map<string, { status?: string; deleted?: boolean }>();
  let pageToken: string | undefined;
  do {
    const url = new URL('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks');
    url.searchParams.set('showCompleted', 'true');
    url.searchParams.set('showHidden', 'true');
    url.searchParams.set('maxResults', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Google Tasks sync failed (${response.status})`);
    const page = await response.json() as { items?: Array<{ id: string; status?: string; deleted?: boolean }>; nextPageToken?: string };
    for (const task of page.items ?? []) tasks.set(task.id, task);
    pageToken = page.nextPageToken;
  } while (pageToken);
  let updated = 0;
  for (const item of items) {
    if (!item.google_task_id) continue;
    const task = tasks.get(item.google_task_id);
    if (!task || task.deleted || !['completed', 'needsAction'].includes(task.status ?? '')) continue;
    const completed = task.status === 'completed';
    if (completed === item.completed) continue;
    const result = await supabaseAdmin.from('action_items').update({ completed })
      .eq('id', item.id).eq('assignee_id', userId).eq('google_task_id', item.google_task_id)
      .eq('completed', item.completed);
    if (result.error) throw new Error(result.error.message);
    updated++;
  }
  return { checked: items.length, updated };
}