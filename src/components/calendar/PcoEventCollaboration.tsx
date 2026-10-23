import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Check, Send, Trash2, Plus, Pencil, ChevronDown, UserRound, MapPin, Megaphone, ListChecks, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { getPcoEventCollaboration, getPcoRoomCatalog, changePcoEventCollaboration, type PcoCollaborationChange } from '@/lib/pco-collaboration.functions';
import { PROMOTION_CHANNELS, COMMS_CHANNEL_OPTIONS } from '@/lib/event-channels';
import { resolvePcoEventOwner } from '@/lib/pco-collaboration';
import { isCommsLabel, scorePlanning, scoreComms, readinessColor } from '@/lib/event-readiness';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

function Section({ icon, title, meta, defaultOpen, children }: { icon: ReactNode; title: string; meta?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
    <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium">
      <span className="text-muted-foreground">{icon}</span>
      <span>{title}</span>
      {meta && <span className="ml-auto text-xs font-normal text-muted-foreground">{meta}</span>}
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${meta ? '' : 'ml-auto'} ${open ? 'rotate-180' : ''}`} />
    </CollapsibleTrigger>
    <CollapsibleContent className="space-y-3 border-t px-3 py-3">{children}</CollapsibleContent>
  </Collapsible>;
}

export function PcoEventCollaboration({ instanceId, pcoLocation }: { instanceId: string; pcoLocation?: string | null }) {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const get = useServerFn(getPcoEventCollaboration);
  const getRooms = useServerFn(getPcoRoomCatalog);
  const roomQuery = useQuery({ queryKey: ['pco-room-catalog'], enabled: !!user, staleTime: 5 * 60_000, queryFn: () => getRooms() });
  const change = useServerFn(changePcoEventCollaboration);
  const [label, setLabel] = useState('');
  const [assignee, setAssignee] = useState('none');
  const [due, setDue] = useState('');
  const [comment, setComment] = useState('');
  const [template, setTemplate] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const q = useQuery({ queryKey: ['pco-event-collaboration', instanceId], enabled: !!user, queryFn: () => get({ data: { instanceId } }) });
  const mutation = useMutation({
    mutationFn: (data: Omit<PcoCollaborationChange, 'instanceId'>) => change({ data: { ...data, instanceId } }),
    onSuccess: async result => {
      if (result.warning) toast.warning(result.warning);
      await queryClient.invalidateQueries({ queryKey: ['pco-event-collaboration', instanceId] });
      await queryClient.invalidateQueries({ queryKey: ['action-items'] });
    },
    onError: error => toast.error(error.message),
  });
  const busy = mutation.isPending;
  const people = q.data?.people ?? [];
  const personName = (id: string | null) => people.find(person => person.id === id)?.full_name || 'Staff member';
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading event planning…</p>;
  if (q.error) return <div className="space-y-2 text-sm text-destructive"><p>Could not load event planning.</p><Button variant="outline" onClick={() => q.refetch()}>Try again</Button></div>;
  if (!q.data) return null;
  const data = q.data;
  const { hub, pco } = data;

  const commsItems = data.checklist.filter(item => isCommsLabel(item.label));
  const otherItems = data.checklist.filter(item => !isCommsLabel(item.label));
  const doneCount = (items: typeof data.checklist) => items.filter(item => item.task?.completed).length;
  const ownerName = resolvePcoEventOwner(hub.owner_id, pco?.owner_name ?? null, people);
  const rooms = pco?.rooms ?? [];
  const catalog = roomQuery.data ?? [];
  const selectedRoom = catalog.find(room => room.name === hub.rooms_note);
  const planning = scorePlanning({ leader_name: ownerName, has_room: rooms.length > 0 || !!hub.rooms_note, checklist_total: otherItems.length, checklist_done: doneCount(otherItems) });
  const comms = scoreComms({ comms_total: commsItems.length, comms_done: doneCount(commsItems) });

  const renderItem = (item: (typeof data.checklist)[number]) => {
    const task = item.task;
    const canChange = data.canEdit || (!!task?.assignee_id && task.assignee_id === user?.id);
    return <div key={item.id} className="py-2.5 space-y-2">
      <div className="flex items-start gap-2">
        <Checkbox aria-label={`Complete ${item.label}`} className="mt-1" checked={task?.completed ?? false} disabled={!canChange || busy} onCheckedChange={value => mutation.mutate({ operation: 'update', id: item.id, completed: value === true })} />
        {editing === item.id ? <form className="flex flex-1 min-w-0 gap-1" onSubmit={async event => { event.preventDefault(); try { await mutation.mutateAsync({ operation: 'update', id: item.id, label: editLabel }); setEditing(null); } catch {} }}><Input aria-label="Edit checklist label" value={editLabel} onChange={event => setEditLabel(event.target.value)} maxLength={500}/><Button size="icon" variant="ghost" aria-label="Save checklist label" disabled={busy || !editLabel.trim()}><Check className="w-4 h-4"/></Button><Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></form> : <span className={`flex-1 min-w-0 break-words text-sm ${task?.completed ? 'line-through text-muted-foreground' : ''}`}>{item.label}</span>}
        {data.canEdit && editing !== item.id && <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Edit ${item.label}`} onClick={() => { setEditing(item.id); setEditLabel(item.label); }}><Pencil className="h-3.5 w-3.5"/></Button>}
        {data.canEdit && <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Delete ${item.label}`} disabled={busy} onClick={() => { if (window.confirm('Delete this checklist item and its linked task?')) mutation.mutate({ operation: 'delete', id: item.id }); }}><Trash2 className="h-3.5 w-3.5"/></Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
        <Select value={task?.assignee_id ?? 'none'} disabled={!data.canEdit || busy || !!task?.google_task_id} onValueChange={value => mutation.mutate({ operation: 'update', id: item.id, assigneeId: value === 'none' ? null : value })}>
          <SelectTrigger aria-label={`Assignee for ${item.label}`} className="h-8 w-44 text-xs"><SelectValue placeholder="Unassigned"/></SelectTrigger>
          <SelectContent><SelectItem value="none">Unassigned</SelectItem>{people.map(person => <SelectItem key={person.id} value={person.id}>{person.full_name || 'Staff member'}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" aria-label={`Due date for ${item.label}`} className="h-8 w-36 text-xs" defaultValue={task?.due_date ?? ''} key={`${item.id}-${task?.due_date}`} disabled={!data.canEdit || busy} onBlur={event => { if (event.target.value !== (task?.due_date ?? '')) mutation.mutate({ operation: 'update', id: item.id, dueDate: event.target.value || null }); }}/>
        {task?.assignee_id && canChange && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={() => mutation.mutate({ operation: 'push', id: item.id })}><Send className="w-3 h-3 mr-1"/>{task.google_task_id ? 'Update Google Tasks' : 'Send to Google Tasks'}</Button>}
        {task?.google_task_pushed_at && <span className="text-xs text-muted-foreground">Sent {new Date(task.google_task_pushed_at).toLocaleDateString()}</span>}
      </div>
    </div>;
  };

  const channelSwitches = (list: readonly { key: string; label: string }[]) => <div className="grid grid-cols-2 gap-2">
    {list.map(c => <label key={c.key} className="flex items-center gap-2 text-sm">
      <Switch checked={hub.channels.includes(c.key)} disabled={!data.canEdit || busy} onCheckedChange={v => mutation.mutate({ operation: 'channel', channel: c.key, enabled: v })} />
      {c.label}
    </label>)}
  </div>;

  return <div className="space-y-2 border-t pt-4">
    <div className="flex flex-wrap gap-3 text-xs">
      <span className={`font-medium ${readinessColor(planning.level)}`} title={planning.missing.join(', ') || 'Ready'}>Planning {planning.score}%</span>
      <span className={`font-medium ${readinessColor(comms.level)}`} title={comms.missing.join(', ') || 'Ready'}>Comms {comms.score}%</span>
      {[...planning.missing, ...comms.missing].length > 0 && <span className="text-muted-foreground">Needs: {[...planning.missing, ...comms.missing].join(', ')}</span>}
    </div>

    <Section icon={<UserRound className="h-4 w-4"/>} title="Owner & location" meta={ownerName ?? 'No owner'} defaultOpen={!ownerName}>
      <div className="space-y-1">
        <Label className="text-xs">Event owner</Label>
        <Select value={hub.owner_id ?? 'none'} disabled={!data.canEdit || busy} onValueChange={v => mutation.mutate({ operation: 'details', ownerId: v === 'none' ? null : v })}>
          <SelectTrigger className="h-8 w-full text-xs" aria-label="Event owner"><SelectValue/></SelectTrigger>
          <SelectContent><SelectItem value="none">{pco?.owner_name ? `Planning Center · ${pco.owner_name}` : 'No Hub owner'} </SelectItem>{people.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || 'Staff member'}</SelectItem>)}</SelectContent>
        </Select>
        {hub.owner_id && <p className="text-xs text-muted-foreground">Hub owner{pco?.owner_name ? ` · Planning Center: ${pco.owner_name}` : ''}</p>}
      </div>
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3"/>Location</Label>
        {pcoLocation ? <p className="text-sm">{pcoLocation} <span className="text-xs text-muted-foreground">· from Planning Center</span></p> :
          <Input className="h-8 text-sm" placeholder="Add a location" maxLength={300} defaultValue={hub.location_note ?? ''} key={`loc-${hub.location_note}`} disabled={!data.canEdit || busy} onBlur={e => { if (e.target.value.trim() !== (hub.location_note ?? '')) mutation.mutate({ operation: 'details', locationNote: e.target.value.trim() || null }); }}/>}
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Rooms</Label>
        {rooms.length > 0 && <p className="text-sm">{rooms.join(', ')} <span className="text-xs text-muted-foreground">· booked in Planning Center</span></p>}
        <Select value={selectedRoom?.id ?? (hub.rooms_note ? 'previous' : 'none')} disabled={!data.canEdit || busy || roomQuery.isPending || !!roomQuery.error} onValueChange={value => mutation.mutate({ operation: 'details', roomId: value === 'none' ? null : value })}>
          <SelectTrigger className="h-8 w-full text-sm" aria-label="Event room"><SelectValue placeholder="Select a room"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{rooms.length ? 'Use Planning Center bookings' : 'No room selected'}</SelectItem>
            {hub.rooms_note && !selectedRoom && <SelectItem value="previous" disabled>{hub.rooms_note}</SelectItem>}
            {catalog.map(room => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {roomQuery.isPending && <p className="text-xs text-muted-foreground">Loading Planning Center rooms…</p>}
        {roomQuery.error && <div className="flex items-center gap-2"><p className="text-xs text-destructive">Planning Center rooms could not be loaded.</p><Button size="sm" variant="ghost" onClick={() => roomQuery.refetch()}>Try again</Button></div>}
        {roomQuery.isSuccess && !catalog.length && <p className="text-xs text-muted-foreground">No rooms listed in Planning Center.</p>}
        {hub.rooms_note && <p className="text-xs text-muted-foreground">Selected in Hub · not a Planning Center booking</p>}
        {pco && pco.resources.length > 0 && <p className="text-xs text-muted-foreground">Resources: {pco.resources.join(', ')}</p>}
      </div>
      {!pco && <p className="text-xs text-muted-foreground">Planning Center owner and room details couldn't be loaded right now.</p>}
    </Section>

    <Section icon={<Megaphone className="h-4 w-4"/>} title="Promotion & comms" meta={commsItems.length ? `${doneCount(commsItems)}/${commsItems.length} done` : `${hub.channels.length} selected`}>
      <div className="space-y-2"><Label className="text-xs">Promote / list on</Label>{channelSwitches(PROMOTION_CHANNELS)}</div>
      <div className="space-y-2"><Label className="text-xs">Comms channels</Label>{channelSwitches(COMMS_CHANNEL_OPTIONS)}</div>
      <p className="text-xs text-muted-foreground">Each channel you turn on adds an unassigned task below.</p>
      {commsItems.length > 0 && <div className="divide-y border-t">{commsItems.map(renderItem)}</div>}
    </Section>

    <Section icon={<ListChecks className="h-4 w-4"/>} title="Checklist & tasks" meta={otherItems.length ? `${doneCount(otherItems)}/${otherItems.length} done` : 'None yet'}>
      {otherItems.length === 0 && <p className="text-sm text-muted-foreground">No checklist items yet.</p>}
      <div className="divide-y">{otherItems.map(renderItem)}</div>
      {data.canEdit && <>
        <form className="space-y-2 border-t pt-3" onSubmit={async event => { event.preventDefault(); try { await mutation.mutateAsync({ operation: 'add', label, assigneeId: assignee === 'none' ? null : assignee, dueDate: due || null }); setLabel(''); } catch {} }}>
          <Label htmlFor="new-pco-checklist" className="text-xs">New checklist item</Label>
          <Input id="new-pco-checklist" value={label} onChange={event => setLabel(event.target.value)} placeholder="Checklist item" maxLength={500}/>
          <div className="flex flex-wrap gap-2">
            <Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="w-44" aria-label="New task assignee"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{people.map(person => <SelectItem key={person.id} value={person.id}>{person.full_name || 'Staff member'}</SelectItem>)}</SelectContent></Select>
            <Input type="date" className="w-36" aria-label="New task due date" value={due} onChange={event => setDue(event.target.value)}/>
            <Button disabled={busy || !label.trim()}><Plus className="w-4 h-4 mr-1"/>Add item</Button>
          </div>
        </form>
        {data.templates.length > 0 && <div className="flex flex-wrap gap-2 border-t pt-3">
          <Select value={template} onValueChange={setTemplate}><SelectTrigger className="w-52" aria-label="Checklist template"><SelectValue placeholder="Checklist template"/></SelectTrigger><SelectContent>{data.templates.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
          <Button variant="outline" disabled={busy || !template} onClick={() => mutation.mutate({ operation: 'template', templateId: template })}><Plus className="w-4 h-4 mr-1"/>Add template</Button>
        </div>}
      </>}
    </Section>

    <Section icon={<MessageSquare className="h-4 w-4"/>} title="Comments" meta={`${data.comments.length}`}>
      {data.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {data.comments.map(item => <div key={item.id} className="border-b pb-2">
        <div className="flex items-center gap-2"><span className="font-medium text-sm">{personName(item.author_id)}</span><span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>{(item.author_id === user?.id || hasRole('core')) && <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="Delete comment" disabled={busy} onClick={() => { if (window.confirm('Delete this comment?')) mutation.mutate({ operation: 'delete-comment', id: item.id }); }}><Trash2 className="h-3.5 w-3.5"/></Button>}</div>
        <p className="mt-1 text-sm whitespace-pre-wrap break-words">{item.body}</p>
      </div>)}
      <form className="space-y-2" onSubmit={async event => { event.preventDefault(); try { await mutation.mutateAsync({ operation: 'comment', body: comment }); setComment(''); } catch {} }}>
        <Textarea id="pco-comment" aria-label="Comment" placeholder="Add a comment" value={comment} onChange={event => setComment(event.target.value)} maxLength={5000}/><Button size="sm" disabled={busy || !comment.trim()}><Send className="w-4 h-4 mr-1"/>Post comment</Button>
      </form>
    </Section>
  </div>;
}
