import { roomRequestTaskLabels, ROOM_REQUEST_FORM_URL, pcoLogisticsPatch } from '@/lib/pco-collaboration';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/require-auth';
import { CHANNEL_KEYS, channelTaskLabel } from './event-channels';
import { canEditPcoChecklist, canPushPcoTask, PCO_STAFF_ROLES, pcoTaskFields } from './pco-collaboration';

const instanceSchema = z.string().regex(/^\d+$/);
export type PcoCollaborationChange = {
  instanceId: string;
  operation: 'add' | 'template' | 'update' | 'delete' | 'push' | 'comment' | 'delete-comment' | 'channel' | 'details';
  channel?: string; enabled?: boolean; ownerId?: string | null; locationNote?: string | null; roomsNote?: string | null; roomId?: string | null;
  noRoomNeeded?: boolean; childcareNeeded?: boolean;
  id?: string; label?: string; body?: string; templateId?: string;
  assigneeId?: string | null; dueDate?: string | null; completed?: boolean;
};
async function access(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
  if (error) throw new Error('Unable to check calendar permissions');
  const roles: string[] = (data ?? []).map((row: { role: string }) => row.role);
  if (!roles.some(role => PCO_STAFF_ROLES.includes(role))) throw new Error('Staff calendar access required');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return { db: supabaseAdmin, roles };
}

export const getPcoRoomCatalog = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await access(context);
    const { fetchRoomCatalog } = await import('@/server/pco-calendar.server');
    try { return await fetchRoomCatalog(); }
    catch { throw new Error('Planning Center rooms could not be loaded. Try again.'); }
  });

export const getPcoEventCollaboration = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ instanceId: instanceSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { db, roles } = await access(context);
    const { data: workspace, error } = await db.from('pco_calendar_workspaces').select('*').eq('instance_id', data.instanceId).maybeSingle();
    if (error) throw new Error('Unable to load event collaboration');
    const { data: staffRoles, error: staffError } = await db.from('user_roles').select('user_id').in('role', PCO_STAFF_ROLES as any);
    if (staffError) throw new Error('Unable to load staff assignees');
    const staffIds = [...new Set((staffRoles ?? []).map(row => row.user_id))];
    const [checklist, comments, people, templates, templateItems, connection] = await Promise.all([
      workspace ? db.from('pco_calendar_checklist').select('id,label,action_item_id,created_at').eq('workspace_id', workspace.id).order('created_at') : Promise.resolve({ data: [], error: null }),
      workspace ? db.from('pco_calendar_comments').select('id,author_id,body,created_at').eq('workspace_id', workspace.id).order('created_at') : Promise.resolve({ data: [], error: null }),
      db.from('profiles').select('id,full_name').in('id', staffIds).order('full_name'),
      db.from('checklist_templates').select('id,name').order('name'),
      db.from('checklist_template_items').select('id,template_id,label,position').order('position'),
      db.from('user_integrations').select('auto_push').eq('user_id', context.userId).eq('provider', 'google_tasks').maybeSingle(),
    ]);
    if ([checklist, comments, people, templates, templateItems, connection].some(result => result.error)) throw new Error('Unable to load event collaboration');
    let details: { owner_name: string | null; rooms: string[]; resources: string[] } | null = null;
    try {
      const pco = await import('@/server/pco-calendar.server');
      const eventId = workspace?.event_id || (await pco.fetchCalendarInstance(data.instanceId)).event_id;
      if (eventId) details = await pco.fetchEventDetails(data.instanceId, eventId);
    } catch (err) {
      console.error('PCO event details failed', err instanceof Error ? err.message : err);
    }
    const ids = (checklist.data ?? []).map(row => row.action_item_id);
    const tasks = ids.length ? await db.from('action_items').select('id,title,assignee_id,due_date,completed,google_task_id,google_task_pushed_at').in('id', ids) : { data: [], error: null };
    if (tasks.error) throw new Error('Unable to load event tasks');
    return {
      checklist: (checklist.data ?? []).map(row => ({ ...row, task: (tasks.data ?? []).find(task => task.id === row.action_item_id) ?? null })),
      comments: comments.data ?? [], people: people.data ?? [],
      templates: (templates.data ?? []).map(template => ({ ...template, items: (templateItems.data ?? []).filter(item => item.template_id === template.id) })),
      canEdit: canEditPcoChecklist(roles), googleConnected: !!connection.data,
      hub: { channels: (workspace?.channels ?? []) as string[], owner_id: workspace?.owner_id ?? null, location_note: workspace?.location_note ?? null, rooms_note: workspace?.rooms_note ?? null, no_room_needed: workspace?.no_room_needed ?? false, childcare_needed: workspace?.childcare_needed ?? false },
      pco: details,
    };
  });

async function syncGoogle(db: any, task: any, callerId: string, force: boolean, remove = false) {
  if (!task.assignee_id) return { pushed: false, warning: force ? 'Assign this task before sending it to Google Tasks.' : null };
  const { data: connection, error } = await db.from('user_integrations').select('auto_push').eq('user_id', task.assignee_id).eq('provider', 'google_tasks').maybeSingle();
  if (error) return { pushed: false, warning: 'Task saved, but the Google Tasks connection could not be checked.' };
  if (!connection) return { pushed: false, warning: force ? 'The assignee must connect Google Tasks in My Tasks first.' : null };
  if (!force && !connection.auto_push && !task.google_task_id) return { pushed: false, warning: null };
  try {
    const { ensureAccessTokenForUser } = await import('@/server/google-tasks.server');
    const token = await ensureAccessTokenForUser(task.assignee_id);
    const url = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks' + (task.google_task_id ? `/${encodeURIComponent(task.google_task_id)}` : '');
    if (remove && !task.google_task_id) return { pushed: false, warning: null };
    const response = await fetch(url, {
      method: remove ? 'DELETE' : task.google_task_id ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(remove ? {} : { body: JSON.stringify({ title: task.title, notes: task.notes ?? '', due: task.due_date ? `${task.due_date}T00:00:00.000Z` : null, status: task.completed ? 'completed' : 'needsAction', ...(!task.completed ? { completed: null } : {}) }) }),
    });
    if (!response.ok && !(remove && response.status === 404)) {
      console.error('PCO task Google sync failed', response.status);
      return { pushed: false, warning: 'Google Tasks could not be updated. Try sending the task again.' };
    }
    if (!remove) {
      const result = await response.json();
      const { error: saveError } = await db.from('action_items').update({ google_task_id: result.id, google_task_pushed_at: new Date().toISOString(), google_task_pushed_by: callerId }).eq('id', task.id);
      if (saveError) throw new Error('Unable to record Google Tasks sync');
    }
    return { pushed: true, warning: null };
  } catch {
    return { pushed: false, warning: 'Google Tasks could not be updated. Check the assignee’s connection in My Tasks.' };
  }
}

export const changePcoEventCollaboration = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PcoCollaborationChange) => z.object({
    instanceId: instanceSchema,
    operation: z.enum(['add', 'template', 'update', 'delete', 'push', 'comment', 'delete-comment', 'channel', 'details']),
    channel: z.string().refine(key => CHANNEL_KEYS.includes(key)).optional(), enabled: z.boolean().optional(),
    ownerId: z.string().uuid().nullable().optional(),
    roomId: instanceSchema.nullable().optional(),
    noRoomNeeded: z.boolean().optional(), childcareNeeded: z.boolean().optional(),
    locationNote: z.string().trim().max(300).nullable().optional(), roomsNote: z.string().trim().max(300).nullable().optional(),
    id: z.string().uuid().optional(), label: z.string().trim().min(1).max(500).optional(),
    body: z.string().trim().min(1).max(5000).optional(), templateId: z.string().uuid().optional(),
    assigneeId: z.string().uuid().nullable().optional(), dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    completed: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { db, roles } = await access(context);
    const isEditor = canEditPcoChecklist(roles);
    if (['add', 'template', 'delete', 'channel', 'details'].includes(data.operation) && !isEditor) throw new Error('Calendar editing access required');
    let { data: workspace, error: workspaceError } = await db.from('pco_calendar_workspaces').select('*').eq('instance_id', data.instanceId).maybeSingle();
    if (workspaceError) throw new Error('Unable to load event');
    if (!workspace) {
      if (!['add', 'template', 'comment', 'channel', 'details'].includes(data.operation)) throw new Error('Event collaboration not found');
      const { fetchCalendarInstance } = await import('@/server/pco-calendar.server');
      const event = await fetchCalendarInstance(data.instanceId);
      const result = await db.from('pco_calendar_workspaces').upsert({ instance_id: event.id, event_id: event.event_id, name: event.name, starts_at: event.starts_at }, { onConflict: 'instance_id' }).select('*').single();
      if (result.error || !result.data) throw new Error('Unable to initialize event collaboration');
      workspace = result.data;
    }
    if (data.operation === 'details') {
      if (data.ownerId) {
        const { data: ownerRoles, error } = await db.from('user_roles').select('role').eq('user_id', data.ownerId);
        if (error || !(ownerRoles ?? []).some(row => PCO_STAFF_ROLES.includes(row.role))) throw new Error('Choose a staff owner');
      }
      let requestLabels: string[] = [];
      if (data.noRoomNeeded === true && (data.roomId !== undefined || data.roomsNote !== undefined)) throw new Error('Choose a room or no room needed, not both');
      const patch: { owner_id?: string | null; location_note?: string | null; rooms_note?: string | null; no_room_needed?: boolean; childcare_needed?: boolean } = pcoLogisticsPatch(data);
      if (data.ownerId !== undefined) patch.owner_id = data.ownerId;
      if (data.locationNote !== undefined) patch.location_note = data.locationNote || null;
      if (data.roomsNote !== undefined) patch.rooms_note = data.roomsNote || null;
      if (data.roomId !== undefined) {
        if (data.roomId === null) patch.rooms_note = null;
        else {
          const { fetchRoomCatalog } = await import('@/server/pco-calendar.server');
          const room = (await fetchRoomCatalog()).find(item => item.id === data.roomId);
          if (!room) throw new Error('Choose a room listed in Planning Center');
          patch.rooms_note = room.name;
          requestLabels = roomRequestTaskLabels(room.name, true);
        }
      }
      const { error } = await db.from('pco_calendar_workspaces').update(patch).eq('id', workspace.id);
      if (error) throw new Error('Unable to save event details');
      if (requestLabels.length) {
        const { data: existing } = await db.from('pco_calendar_checklist').select('label').eq('workspace_id', workspace.id).in('label', requestLabels);
        const have = new Set((existing ?? []).map(row => row.label));
        for (const label of requestLabels.filter(item => !have.has(item))) {
          const fields = pcoTaskFields(workspace, label);
          const notes = label.includes('submitted') ? `${fields.notes}\nRoom request form: ${ROOM_REQUEST_FORM_URL}` : fields.notes;
          const { error: taskError } = await (db as any).rpc('create_pco_checklist_task', { _workspace_id: workspace.id, _label: label, _title: fields.title, _notes: notes, _assignee_id: null, _due_date: null, _created_by: context.userId });
          if (taskError) return { warning: 'Room saved, but the room request tasks could not be created.' };
        }
      }
      return { warning: null };
    }
    if (data.operation === 'channel') {
      const label = data.channel ? channelTaskLabel(data.channel) : null;
      if (!data.channel || !label || data.enabled === undefined) throw new Error('Choose a channel');
      const current: string[] = workspace.channels ?? [];
      const next = data.enabled ? [...new Set([...current, data.channel])] : current.filter(key => key !== data.channel);
      const { error } = await db.from('pco_calendar_workspaces').update({ channels: next }).eq('id', workspace.id);
      if (error) throw new Error('Unable to save channel');
      const { data: existing, error: existingError } = await db.from('pco_calendar_checklist').select('id,action_item_id').eq('workspace_id', workspace.id).eq('label', label);
      if (existingError) throw new Error('Unable to update channel task');
      if (data.enabled && !(existing ?? []).length) {
        // Channel tasks start unassigned; staff assign them from the checklist.
        const fields = pcoTaskFields(workspace, label);
        const { error: taskError } = await (db as any).rpc('create_pco_checklist_task', { _workspace_id: workspace.id, _label: label, _title: fields.title, _notes: fields.notes, _assignee_id: null, _due_date: null, _created_by: context.userId });
        if (taskError) throw new Error('Channel saved, but its task could not be created');
      }
      if (!data.enabled && (existing ?? []).length) {
        const ids = (existing ?? []).map(row => row.action_item_id);
        const { data: tasks } = await db.from('action_items').select('id,completed,google_task_id').in('id', ids);
        const removable = (tasks ?? []).filter(task => !task.completed && !task.google_task_id).map(task => task.id);
        if (removable.length) await db.from('action_items').delete().in('id', removable);
        if (removable.length < ids.length) return { warning: 'Channel removed. Its task was kept because it is completed or already in Google Tasks.' };
      }
      return { warning: null };
    }
    if (data.operation === 'comment') {
      if (!data.body) throw new Error('Enter a comment');
      const { error } = await db.from('pco_calendar_comments').insert({ workspace_id: workspace.id, author_id: context.userId, body: data.body });
      if (error) throw new Error('Unable to save comment');
      return { warning: null };
    }
    if (data.operation === 'delete-comment') {
      if (!data.id) throw new Error('Comment required');
      const { data: comment, error } = await db.from('pco_calendar_comments').select('author_id').eq('id', data.id).eq('workspace_id', workspace.id).maybeSingle();
      if (error || !comment) throw new Error('Comment not found');
      if (comment.author_id !== context.userId && !roles.includes('core')) throw new Error('You can only delete your own comments');
      const result = await db.from('pco_calendar_comments').delete().eq('id', data.id).eq('workspace_id', workspace.id);
      if (result.error) throw new Error('Unable to delete comment');
      return { warning: null };
    }
    if (data.operation === 'add' || data.operation === 'template') {
      if (data.assigneeId) {
        const { data: assigneeRoles, error } = await db.from('user_roles').select('role').eq('user_id', data.assigneeId);
        if (error || !(assigneeRoles ?? []).some(row => PCO_STAFF_ROLES.includes(row.role))) throw new Error('Choose a staff assignee');
      }
      let labels: string[] = [];
      if (data.operation === 'template') {
        if (!data.templateId) throw new Error('Choose a checklist template');
        const result = await db.from('checklist_template_items').select('label').eq('template_id', data.templateId).order('position');
        if (result.error || !result.data?.length) throw new Error('This template has no checklist items');
        labels = result.data.map(item => item.label);
      } else {
        if (!data.label) throw new Error('Enter a checklist item');
        labels = [data.label];
      }
      let warning: string | null = null;
      for (const label of labels) {
        const fields = pcoTaskFields(workspace, label);
        // PostgreSQL accepts null for these optional task fields; generated RPC argument types omit nullability.
        const { data: taskId, error } = await (db as any).rpc('create_pco_checklist_task', { _workspace_id: workspace.id, _label: label, _title: fields.title, _notes: fields.notes, _assignee_id: data.assigneeId ?? null, _due_date: data.dueDate ?? null, _created_by: context.userId });
        if (error) throw new Error('Unable to save checklist task');
        const sync = await syncGoogle(db, { id: taskId, ...fields, assignee_id: data.assigneeId ?? null, due_date: data.dueDate ?? null, completed: false }, context.userId, false);
        warning = sync.warning ?? warning;
      }
      return { warning };
    }
    if (!data.id) throw new Error('Checklist item required');
    const { data: checklist, error } = await db.from('pco_calendar_checklist').select('*').eq('id', data.id).eq('workspace_id', workspace.id).maybeSingle();
    if (error || !checklist) throw new Error('Checklist item not found');
    const { data: task, error: taskError } = await db.from('action_items').select('*').eq('id', checklist.action_item_id).eq('pco_workspace_id', workspace.id).single();
    if (taskError || !task) throw new Error('Task not found');
    if (data.operation === 'push') {
      if (!task.assignee_id || !canPushPcoTask(roles, context.userId, task.assignee_id)) throw new Error('You cannot send this task for this assignee');
      return syncGoogle(db, task, context.userId, true);
    }
    if (data.operation === 'delete') {
      const sync = await syncGoogle(db, task, context.userId, true, true);
      if (task.google_task_id && sync.warning) throw new Error(sync.warning);
      const result = await db.from('action_items').delete().eq('id', task.id);
      if (result.error) throw new Error('Unable to delete task');
      return { warning: null };
    }
    if (!isEditor && !(task.assignee_id === context.userId && data.completed !== undefined && data.assigneeId === undefined && data.label === undefined && data.dueDate === undefined)) throw new Error('Calendar editing access required');
    if (data.assigneeId !== undefined && data.assigneeId !== task.assignee_id) {
      if (task.google_task_id) throw new Error('Remove the synced task before assigning it to another person');
      if (data.assigneeId) {
        const result = await db.from('user_roles').select('role').eq('user_id', data.assigneeId);
        if (result.error || !(result.data ?? []).some(row => PCO_STAFF_ROLES.includes(row.role))) throw new Error('Choose a staff assignee');
      }
    }
    const fields = pcoTaskFields(workspace, data.label ?? checklist.label);
    const changes = { ...fields, ...(data.assigneeId !== undefined ? { assignee_id: data.assigneeId } : {}), ...(data.dueDate !== undefined ? { due_date: data.dueDate } : {}), ...(data.completed !== undefined ? { completed: data.completed } : {}) };
    const result = await db.from('action_items').update(changes).eq('id', task.id);
    if (result.error) throw new Error('Unable to update task');
    if (data.label !== undefined) {
      const labelResult = await db.from('pco_calendar_checklist').update({ label: data.label }).eq('id', checklist.id);
      if (labelResult.error) throw new Error('Task saved, but checklist label could not be updated');
    }
    return syncGoogle(db, { ...task, ...changes }, context.userId, false);
  });