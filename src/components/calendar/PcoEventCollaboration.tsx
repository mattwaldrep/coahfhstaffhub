import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Check, Send, Trash2, Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { getPcoEventCollaboration, changePcoEventCollaboration, type PcoCollaborationChange } from '@/lib/pco-collaboration.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function PcoEventCollaboration({ instanceId }: { instanceId: string }) {
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const get = useServerFn(getPcoEventCollaboration);
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
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading checklists and comments…</p>;
  if (q.error) return <div className="space-y-2 text-sm text-destructive"><p>Could not load checklists and comments.</p><Button variant="outline" onClick={() => q.refetch()}>Try again</Button></div>;
  if (!q.data) return null;
  const data = q.data;
  return <Tabs defaultValue="checklist" className="border-t pt-4">
    <TabsList><TabsTrigger value="checklist">Checklist & Tasks ({data.checklist.length})</TabsTrigger><TabsTrigger value="comments">Comments ({data.comments.length})</TabsTrigger></TabsList>
    <TabsContent value="checklist" className="space-y-4">
      {data.checklist.length > 0 && <p className="text-xs text-muted-foreground">{data.checklist.filter(item => item.task?.completed).length} of {data.checklist.length} complete</p>}
      {data.checklist.length === 0 && <p className="text-sm text-muted-foreground">No checklist items yet.</p>}
      <div className="divide-y">
        {data.checklist.map(item => {
          const task = item.task;
          const canChange = data.canEdit || (!!task?.assignee_id && task.assignee_id === user?.id);
          return <div key={item.id} className="py-3 space-y-2">
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
        })}
      </div>
      {data.canEdit && <>
        <form className="space-y-2 border-t pt-3" onSubmit={async event => { event.preventDefault(); try { await mutation.mutateAsync({ operation: 'add', label, assigneeId: assignee === 'none' ? null : assignee, dueDate: due || null }); setLabel(''); } catch {} }}>
          <Label htmlFor="new-pco-checklist">New checklist item</Label>
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
    </TabsContent>
    <TabsContent value="comments" className="space-y-3">
      {data.comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {data.comments.map(item => <div key={item.id} className="border-b py-3">
        <div className="flex items-center gap-2"><span className="font-medium text-sm">{personName(item.author_id)}</span><span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>{(item.author_id === user?.id || hasRole('core')) && <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="Delete comment" disabled={busy} onClick={() => { if (window.confirm('Delete this comment?')) mutation.mutate({ operation: 'delete-comment', id: item.id }); }}><Trash2 className="h-3.5 w-3.5"/></Button>}</div>
        <p className="mt-1 text-sm whitespace-pre-wrap break-words">{item.body}</p>
      </div>)}
      <form className="space-y-2" onSubmit={async event => { event.preventDefault(); try { await mutation.mutateAsync({ operation: 'comment', body: comment }); setComment(''); } catch {} }}>
        <Label htmlFor="pco-comment">Comment</Label><Textarea id="pco-comment" value={comment} onChange={event => setComment(event.target.value)} maxLength={5000}/><Button disabled={busy || !comment.trim()}><Send className="w-4 h-4 mr-1"/>Post comment</Button>
      </form>
    </TabsContent>
  </Tabs>;
}