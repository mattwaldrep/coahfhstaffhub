import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Plus, Check, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

  // Load or create today's meeting
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

  // Realtime subscriptions
  useEffect(() => {
    if (!meeting) return;
    const channel = supabase
      .channel(`meeting-${meeting.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agenda_items", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => {
          setAgenda((prev) => applyChange(prev, payload, "position"));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_items", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => {
          setActions((prev) => applyChange(prev, payload));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${meeting.id}` },
        (payload) => {
          const next = payload.new as Meeting;
          setMeeting(next);
          // Don't clobber the user's local notes draft if they're typing
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
    if (!meeting || !newAgenda.trim()) return;
    const title = newAgenda.trim();
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

  const removeAgenda = async (id: string) => {
    await supabase.from("agenda_items").delete().eq("id", id);
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

  const toggleAction = async (item: ActionItem) => {
    await supabase.from("action_items").update({ completed: !item.completed }).eq("id", item.id);
  };

  const removeAction = async (id: string) => {
    await supabase.from("action_items").delete().eq("id", id);
  };

  // Debounced autosave for notes
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

  // Web Speech transcription
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);

  const toggleTranscription = useCallback(() => {
    if (!meeting) return;
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
      <div className="max-w-6xl mx-auto">
        <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {meeting ? new Date(meeting.meeting_date + "T00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : ""}
            </p>
            <h1 className="text-3xl font-display font-bold mt-1">Weekly Staff Meeting</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live agenda and notes — every change syncs across the room in real time.
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
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Agenda */}
          <section className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Agenda</h2>
            <ul className="space-y-2">
              {agenda.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-start gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <button
                    onClick={() => toggleAgenda(item)}
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
                      {item.title}
                    </div>
                    {item.owner_name && (
                      <div className="text-xs text-muted-foreground mt-0.5">{item.owner_name}</div>
                    )}
                  </div>
                  <button
                    onClick={() => removeAgenda(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
              {agenda.length === 0 && (
                <li className="text-sm text-muted-foreground py-4">No agenda items yet — add the first one below.</li>
              )}
            </ul>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addAgenda();
              }}
              className="mt-4 flex gap-2"
            >
              <input
                value={newAgenda}
                onChange={(e) => setNewAgenda(e.target.value)}
                placeholder="Add agenda item…"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button type="submit" size="icon" disabled={!newAgenda.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </section>

          {/* Action items */}
          <section className="bg-surface border border-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Action Items</h2>
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
          </section>

          {/* Notes */}
          <section className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Meeting Notes</h2>
            <textarea
              id="meeting-notes"
              value={notesDraft}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Type meeting notes here. They auto-save and sync to everyone in the room."
              className="w-full min-h-[280px] bg-background border border-border rounded-lg p-4 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-y"
            />
          </section>

          {/* Transcript */}
          <section className="bg-surface border border-border rounded-2xl p-6">
            <h2 className="font-display font-semibold text-lg mb-4">Live Transcript</h2>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[280px] max-h-[400px] overflow-y-auto">
              {meeting?.transcript ?? (
                <span className="italic">Press “Start transcription” to capture the conversation.</span>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
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
