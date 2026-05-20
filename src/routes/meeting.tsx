import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Plus, Check, Trash2, Loader2, Send, MailCheck, GripVertical, Pencil, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { finalizeMeeting, sendMeetingRecap } from "@/server/meeting.functions";
import { cn } from "@/lib/utils";
import { LinkedText } from "@/lib/render-linked-text";
import { RichTextEditor, RichTextView } from "@/components/ui/rich-text-editor";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function AgendaTitle({ value, className }: { value: string; className?: string }) {
  if (!value) return null;
  const looksHtml = /<[a-z][\s\S]*>/i.test(value);
  if (looksHtml) return <RichTextView html={value} className={className} />;
  return <span className={className}><LinkedText value={value} /></span>;
}
import { toast } from "sonner";
import { useUndoableAction } from "@/lib/use-undoable-action";
import {
  StandingSection,
  DevotionalSection,
  SundayReviewSection,
  LastWeekEventsSection,
  UpcomingEventsSection,
  LinkSection,
  ReviewTrendsSection,
  ReviewTasksSection,
  SectionDivider,
  ClassesNeedingAttentionSection,
} from "@/components/meeting/MeetingSections";

export const Route = createFileRoute("/meeting")({
  component: MeetingPage,
});

type AgendaItem = {
  id: string;
  meeting_id: string;
  title: string;
  notes: string | null;
  owner_name: string | null;
  status: string;
  position: number;
};

type ActionItem = {
  id: string;
  meeting_id: string | null;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  completed: boolean;
};

type Meeting = {
  id: string;
  meeting_date: string;
  title: string;
  notes: string | null;
  transcript: string | null;
  status: string;
  recap_sent_at?: string | null;
  completed_at?: string | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function MeetingPage() {
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [newAgenda, setNewAgenda] = useState("");
  const [newAction, setNewAction] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undo = useUndoableAction();

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const date = todayISO();
      const { data: existing } = await supabase
        .from("meetings")
        .select("*")
        .eq("meeting_date", date)
        .maybeSingle();

      let m = existing as Meeting | null;
      if (!m) {
        const { data: created, error } = await supabase
          .from("meetings")
          .upsert(
            { meeting_date: date, title: "Weekly Staff Meeting", created_by: user.id },
            { onConflict: "meeting_date" },
          )
          .select()
          .single();
        if (error) {
          toast.error(error.message);
          return;
        }
        m = created as Meeting;
      }
      if (!mounted) return;
      setMeeting(m);
      setNotesDraft(m.notes ?? "");

      const [{ data: ag }, { data: ac }] = await Promise.all([
        supabase.from("agenda_items").select("*").eq("meeting_id", m.id).order("position"),
        supabase.from("action_items").select("*").eq("meeting_id", m.id).order("created_at"),
      ]);
      if (!mounted) return;
      setAgenda((ag ?? []) as AgendaItem[]);
      setActions((ac ?? []) as ActionItem[]);
    })();
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!meeting) return;
    const channel = supabase
      .channel(`meeting-${meeting.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agenda_items", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => setAgenda((prev) => applyChange(prev, payload, "position")),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_items", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => setActions((prev) => applyChange(prev, payload)),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${meeting.id}` },
        (payload) => {
          const next = payload.new as Meeting;
          setMeeting(next);
          if (document.activeElement?.id !== "meeting-notes") {
            setNotesDraft(next.notes ?? "");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meeting?.id]);

  const addAgenda = async () => {
    if (!meeting) return;
    const plain = newAgenda.replace(/<[^>]+>/g, "").trim();
    if (!plain) return;
    const title = newAgenda;
    setNewAgenda("");
    const position = agenda.length;
    const { error } = await supabase
      .from("agenda_items")
      .insert({ meeting_id: meeting.id, title, position, created_by: user?.id });
    if (error) toast.error(error.message);
  };

  const toggleAgenda = async (item: AgendaItem) => {
    const next = item.status === "done" ? "open" : "done";
    await supabase.from("agenda_items").update({ status: next }).eq("id", item.id);
  };

  const removeAgenda = (id: string) => {
    const item = agenda.find((a) => a.id === id);
    if (!item) return;
    undo({
      optimistic: () => {
        setAgenda((prev) => prev.filter((a) => a.id !== id));
        return item;
      },
      rollback: (snap) => setAgenda((prev) => [...prev, snap].sort((a, b) => a.position - b.position)),
      commit: async () => {
        const { error } = await supabase.from("agenda_items").delete().eq("id", id);
        if (error) throw new Error(error.message);
      },
      message: "Agenda item removed",
    });
  };

  const editAgenda = async (id: string, title: string) => {
    const { error } = await supabase.from("agenda_items").update({ title }).eq("id", id);
    if (error) toast.error(error.message);
  };

  const reorderAgenda = async (reordered: AgendaItem[]) => {
    setAgenda(reordered.map((it, idx) => ({ ...it, position: idx })));
    const changes = reordered
      .map((it, idx) => ({ it, idx }))
      .filter(({ it, idx }) => it.position !== idx);
    if (changes.length === 0) return;
    const results = await Promise.all(
      changes.map(({ it, idx }) =>
        supabase.from("agenda_items").update({ position: idx }).eq("id", it.id),
      ),
    );
    const err = results.find((r) => r.error);
    if (err?.error) toast.error(err.error.message);
  };

  const addAction = async () => {
    if (!meeting || !newAction.trim()) return;
    const title = newAction.trim();
    setNewAction("");
    const { error } = await supabase
      .from("action_items")
      .insert({ meeting_id: meeting.id, title, created_by: user?.id });
    if (error) toast.error(error.message);
  };

  const toggleAction = (item: ActionItem) => {
    if (item.completed) {
      // un-completing is non-destructive — just write
      supabase.from("action_items").update({ completed: false }).eq("id", item.id);
      return;
    }
    undo({
      optimistic: () => {
        setActions((prev) => prev.map((a) => (a.id === item.id ? { ...a, completed: true } : a)));
        return item;
      },
      rollback: (snap) =>
        setActions((prev) => prev.map((a) => (a.id === snap.id ? { ...a, completed: false } : a))),
      commit: async () => {
        const { error } = await supabase.from("action_items").update({ completed: true }).eq("id", item.id);
        if (error) throw new Error(error.message);
      },
      message: "Marked complete",
    });
  };

  const removeAction = (id: string) => {
    const item = actions.find((a) => a.id === id);
    if (!item) return;
    undo({
      optimistic: () => {
        setActions((prev) => prev.filter((a) => a.id !== id));
        return item;
      },
      rollback: (snap) => setActions((prev) => [...prev, snap]),
      commit: async () => {
        const { error } = await supabase.from("action_items").delete().eq("id", id);
        if (error) throw new Error(error.message);
      },
      message: "Action item removed",
    });
  };

  const onNotesChange = (val: string) => {
    setNotesDraft(val);
    if (!meeting) return;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    setSavingNotes(true);
    notesTimer.current = setTimeout(async () => {
      await supabase.from("meetings").update({ notes: val }).eq("id", meeting.id);
      setSavingNotes(false);
    }, 600);
  };

  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);

  const toggleTranscription = useCallback(() => {
    if (!meeting) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Speech recognition not supported in this browser. Try Chrome.");
      return;
    }
    if (listeningRef.current) {
      listeningRef.current = false;
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    let buffer = meeting.transcript ?? "";
    rec.onresult = async (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          buffer += (buffer ? " " : "") + e.results[i][0].transcript.trim();
        }
      }
      await supabase.from("meetings").update({ transcript: buffer }).eq("id", meeting.id);
    };
    rec.onerror = (e: any) => {
      toast.error(`Transcription error: ${e.error}`);
      listeningRef.current = false;
      setListening(false);
    };
    rec.onend = () => {
      if (listeningRef.current) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    rec.start();
    recognitionRef.current = rec;
    listeningRef.current = true;
    setListening(true);
  }, [meeting]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {meeting
                ? new Date(meeting.meeting_date + "T00:00").toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                : ""}
            </p>
            <h1 className="text-3xl font-display font-bold mt-1">Weekly Staff Meeting</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Standing agenda — every section syncs across the room in real time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savingNotes && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving
              </span>
            )}
            <Button
              variant={listening ? "default" : "outline"}
              onClick={toggleTranscription}
              disabled={!meeting}
            >
              {listening ? <MicOff className="w-4 h-4 mr-2" /> : <Mic className="w-4 h-4 mr-2" />}
              {listening ? "Stop transcription" : "Start transcription"}
            </Button>
            <FinalizeButton meeting={meeting} setMeeting={setMeeting} />
          </div>
        </header>

        {!meeting ? (
          <div className="text-sm text-muted-foreground">Loading meeting…</div>
        ) : (
          <div className="space-y-3">
            <DevotionalSection meetingId={meeting.id} />

            <SectionDivider label="Recurring Agenda Items" />

            <SundayReviewSection meetingId={meeting.id} />
            <LastWeekEventsSection meetingId={meeting.id} />
            <LinkSection
              meetingId={meeting.id}
              sectionKey="first_step_cards"
              title="First Step Cards"
              subtitle="Review new submissions in PCO."
              href="https://people.planningcenteronline.com/forms/161115"
              linkLabel="Open First Step form in PCO"
            />
            <LinkSection
              meetingId={meeting.id}
              sectionKey="next_step_cards"
              title="Next Step Cards"
              subtitle="Review next-step submissions in PCO."
              href="https://people.planningcenteronline.com/forms/433638"
              linkLabel="Open Next Step form in PCO"
            />
            <ReviewTrendsSection meetingId={meeting.id} meetingDate={meeting.meeting_date} />
            <ReviewTasksSection />

            <SectionDivider label="This Week" />

            {/* Items To Discuss (formerly Agenda) */}
            <StandingSection
              title="Items To Discuss"
              subtitle="Topics specific to this week's meeting."
              badge={
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                  {agenda.length} {agenda.length === 1 ? "item" : "items"}
                </span>
              }
            >
              <SortableAgendaList items={agenda} onReorder={reorderAgenda}>
                {(item) => (
                  <AgendaRow
                    item={item}
                    onToggle={() => toggleAgenda(item)}
                    onDelete={() => removeAgenda(item.id)}
                    onSave={(title) => editAgenda(item.id, title)}
                  />
                )}
              </SortableAgendaList>
              {agenda.length === 0 && (
                <div className="text-sm text-muted-foreground py-2">
                  No discussion items yet — add one below.
                </div>
              )}
              <div className="mt-4 space-y-2">
                <RichTextEditor
                  value={newAgenda}
                  onChange={setNewAgenda}
                  placeholder="Add discussion item…  (use the link button to add hyperlinks)"
                  minHeight={40}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={addAgenda}
                  disabled={!newAgenda.replace(/<[^>]+>/g, "").trim()}
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </StandingSection>

            <UpcomingEventsSection meetingId={meeting.id} />
            <ClassesNeedingAttentionSection />

            <SectionDivider label="Capture" />

            {/* Action Items (this meeting) */}
            <StandingSection
              title="New Action Items"
              subtitle="Tasks created in today's meeting. Open items appear in Review Tasks above."
              defaultOpen={false}
            >
              <ul className="space-y-2">
                {actions.map((item) => (
                  <li key={item.id} className="group flex items-start gap-3">
                    <button
                      onClick={() => toggleAction(item)}
                      className={cn(
                        "mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0",
                        item.completed
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-border",
                      )}
                    >
                      {item.completed && <Check className="w-3 h-3" />}
                    </button>
                    <span className={cn("flex-1 text-sm", item.completed && "line-through text-muted-foreground")}>
                      {item.title}
                    </span>
                    <button
                      onClick={() => removeAction(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
                {actions.length === 0 && (
                  <li className="text-sm text-muted-foreground py-2">No action items yet.</li>
                )}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addAction();
                }}
                className="mt-4 flex gap-2"
              >
                <input
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="New action item…"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button type="submit" size="icon" disabled={!newAction.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </form>
            </StandingSection>

            <MeetingDecisionsSection meetingId={meeting.id} />

            {/* Notes */}
            <StandingSection title="Meeting Notes" subtitle="General notes for the whole meeting." defaultOpen={false}>
              <textarea
                id="meeting-notes"
                value={notesDraft}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Type meeting notes here. They auto-save and sync to everyone in the room."
                className="w-full min-h-[200px] bg-background border border-border rounded-lg p-4 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              />
            </StandingSection>

            {/* Transcript */}
            <StandingSection title="Live Transcript" subtitle="Captured when transcription is on." defaultOpen={false}>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[120px] max-h-[400px] overflow-y-auto">
                {meeting?.transcript ?? (
                  <span className="italic">Press “Start transcription” to capture the conversation.</span>
                )}
              </div>
            </StandingSection>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function FinalizeButton({
  meeting,
  setMeeting,
}: {
  meeting: Meeting | null;
  setMeeting: (m: Meeting) => void;
}) {
  const finalize = useServerFn(finalizeMeeting);
  const sendRecap = useServerFn(sendMeetingRecap);
  const [busy, setBusy] = useState(false);
  if (!meeting) return null;

  const isCompleted = meeting.status === "completed";
  const recapSent = !!meeting.recap_sent_at;

  async function handle() {
    if (!meeting) return;
    setBusy(true);
    try {
      if (!isCompleted) {
        await finalize({ data: { meetingId: meeting.id } });
        setMeeting({ ...meeting, status: "completed", completed_at: new Date().toISOString() });
      }
      const result = await sendRecap({ data: { meetingId: meeting.id } });
      setMeeting({
        ...meeting,
        status: "completed",
        recap_sent_at: new Date().toISOString(),
        completed_at: meeting.completed_at ?? new Date().toISOString(),
      });
      toast.success(`Recap sent to ${result.recipients} staff`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={handle} disabled={busy} variant={recapSent ? "outline" : "default"}>
      {busy ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : recapSent ? (
        <MailCheck className="w-4 h-4 mr-2" />
      ) : (
        <Send className="w-4 h-4 mr-2" />
      )}
      {recapSent ? "Resend recap" : isCompleted ? "Send recap" : "Finalize & send recap"}
    </Button>
  );
}

function applyChange<T extends { id: string }>(
  prev: T[],
  payload: { eventType: string; new: any; old: any },
  sortKey?: keyof T,
): T[] {
  let next = prev;
  if (payload.eventType === "INSERT") {
    if (prev.find((p) => p.id === payload.new.id)) return prev;
    next = [...prev, payload.new as T];
  } else if (payload.eventType === "UPDATE") {
    next = prev.map((p) => (p.id === payload.new.id ? (payload.new as T) : p));
  } else if (payload.eventType === "DELETE") {
    next = prev.filter((p) => p.id !== payload.old.id);
  }
  if (sortKey) {
    next = [...next].sort((a, b) => (a[sortKey] as any) - (b[sortKey] as any));
  }
  return next;
}

function SortableAgendaList({
  items,
  onReorder,
  children,
}: {
  items: AgendaItem[];
  onReorder: (items: AgendaItem[]) => void;
  children: (item: AgendaItem) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ids = items.map((i) => i.id);
  const onEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(items, oldIdx, newIdx));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {items.map((item) => (
            <SortableLi key={item.id} id={item.id}>
              {children(item)}
            </SortableLi>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableLi({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/40 transition-colors">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </li>
  );
}

function AgendaRow({
  item,
  onToggle,
  onDelete,
  onSave,
}: {
  item: AgendaItem;
  onToggle: () => void;
  onDelete: () => void;
  onSave: (title: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(item.title); }, [item.title]);

  async function save() {
    const plain = draft.replace(/<[^>]+>/g, "").trim();
    if (!plain) { toast.error("Title cannot be empty"); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <RichTextEditor value={draft} onChange={setDraft} minHeight={40} />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            <Check className="w-3 h-3 mr-1" /> Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(item.title); }}>
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <button
        onClick={onToggle}
        className={cn(
          "mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0",
          item.status === "done"
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border",
        )}
      >
        {item.status === "done" && <Check className="w-3 h-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm", item.status === "done" && "line-through text-muted-foreground")}>
          <AgendaTitle value={item.title} />
        </div>
        {item.owner_name && (
          <div className="text-xs text-muted-foreground mt-0.5">{item.owner_name}</div>
        )}
      </div>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        aria-label="Edit"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
        aria-label="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
